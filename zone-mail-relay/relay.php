<?php

declare(strict_types=1);

/**
 * Kivora Zone mail relay.
 *
 * Render's free tier blocks outbound SMTP (ports 25/465/587), so the
 * Render API backend cannot deliver mail directly. This script receives a
 * structured, Bearer-authenticated HTTPS POST from Render and delivers the
 * message locally via Zone's own sendmail (PHP's mail()) — no third-party
 * email service involved.
 *
 * Security properties (see zone-mail-relay/README.md for the full
 * deployment story and zone-mail-relay/tests/relay.test.php for the tests
 * proving each of these):
 *   - POST and application/json only; any other method (including a plain
 *     browser GET) is rejected before mail() is ever reached.
 *   - A small, fixed body-size limit, checked before reading the body.
 *   - A shared high-entropy secret, compared with hash_equals() (constant
 *     time), loaded from a file OUTSIDE the public docroot — never from
 *     this file, never committed to git. Missing/invalid secret
 *     configuration fails closed with a generic 500, never with a
 *     fallback that lets a request through.
 *   - Recipient, sender address, and sender display name are a FIXED
 *     server-side map keyed only by the validated `type` field — a `to`,
 *     `from`, or `replyTo` in the request body is never read or honoured.
 *   - Reply-To is derived only from the request's own validated email
 *     field, only for contact (always) and feedback (only when
 *     mayContact is true) — support never gets a Reply-To.
 *   - Every value that ends up in a mail header (name, email, subject,
 *     feedbackType) is length-limited and rejected outright if it
 *     contains a CR or LF byte — the classic mail() header-injection
 *     vector. The message BODY is exempt from the CR/LF check (a
 *     multi-line message is legitimate) but is still length-limited.
 *   - Non-ASCII header values are RFC 2047 (MIME) encoded explicitly —
 *     PHP's mail() does not do this automatically, and un-encoded
 *     Estonian characters (õäüöšž) in a raw header can be mangled or
 *     trigger spam filters.
 *   - Every error response is a small, fixed, generic message — never a
 *     raw PHP/mail() error, a file path, or the secret.
 *
 * All of the actual logic lives in pure(ish) functions that take their
 * inputs as explicit parameters (never reading $_SERVER/php://input
 * directly) so the whole request-handling flow is unit-testable without
 * a real HTTP request or real superglobals — see relay_handle_request()
 * below and zone-mail-relay/tests/relay.test.php. The only code that
 * touches superglobals/mail() directly is the short bootstrap block at
 * the bottom of this file, guarded so it never runs while this file is
 * merely `require`d by the test harness.
 */

const MAIL_RELAY_MAX_BODY_BYTES = 20000; // 20 KB
const MAIL_RELAY_MAX_MESSAGE_BYTES = 8000;
const MAIL_RELAY_ALLOWED_TYPES = ['contact', 'support', 'feedback'];

// Fixed, server-side only — NEVER taken from the request body.
const MAIL_RELAY_RECIPIENTS = [
    'contact'  => 'info@kivora.ee',
    'support'  => 'support@kivora.ee',
    'feedback' => 'support@kivora.ee',
];
const MAIL_RELAY_FROM_DISPLAY_NAMES = [
    'contact'  => 'Kivora',
    'support'  => 'Kivora Support',
    'feedback' => 'Kivora Feedback',
];
const MAIL_RELAY_FROM_ADDRESS = 'noreply@kivora.ee';

// The required secret format: exactly 64 lowercase hex characters — a
// 32-byte / 256-bit secret generated with `openssl rand -hex 32`.
const MAIL_RELAY_SECRET_FORMAT_REGEX = '/\A[a-f0-9]{64}\z/';

// The exact placeholder value shipped (committed) in secret.example.php.
// Rejected explicitly, by name, in addition to the format check below —
// belt-and-suspenders: even if the format requirement ever changed, this
// specific known-public string must never be accepted as a real secret.
const MAIL_RELAY_KNOWN_PLACEHOLDER_SECRET = 'REPLACE_WITH_A_REAL_HIGH_ENTROPY_SECRET';

/**
 * True only for a string that is exactly 64 lowercase hex characters.
 * Never trims or otherwise normalizes the input first — a secret with
 * leading/trailing whitespace, uppercase hex digits, or the wrong length
 * is invalid, full stop, not "fixed up" into something that would pass.
 */
function relay_is_valid_secret_format(string $secret): bool
{
    if ($secret === MAIL_RELAY_KNOWN_PLACEHOLDER_SECRET) {
        return false;
    }
    return preg_match(MAIL_RELAY_SECRET_FORMAT_REGEX, $secret) === 1;
}

/**
 * RFC 2047 (MIME "B" / base64) encodes a header value when it contains any
 * non-ASCII byte; returns the value unchanged when it's already pure ASCII.
 * PHP's mail() never does this itself, so every header-bound value must
 * pass through here before being placed in a header.
 */
function relay_mime_encode_header(string $value): string
{
    if (preg_match('/[^\x20-\x7E]/', $value) !== 1) {
        return $value;
    }
    $encoded = mb_encode_mimeheader($value, 'UTF-8', 'B', "\r\n");
    return $encoded === false ? $value : $encoded;
}

/**
 * Validates one header-bound field from the decoded JSON body:
 *   - absent / null / empty-after-trim -> null (field simply omitted)
 *   - present but not a string, too long, or containing CR/LF -> throws
 *     InvalidArgumentException (the caller turns this into a generic 400)
 *   - otherwise -> the trimmed string
 *
 * Deliberately strict (reject, never silently strip) — a caller that sends
 * a CR/LF-laden value is either buggy or hostile, and silently "fixing" it
 * would hide exactly the class of bug (header injection) this guards
 * against.
 */
function relay_validate_header_field(array $data, string $key, int $maxLen): ?string
{
    if (!array_key_exists($key, $data) || $data[$key] === null) {
        return null;
    }
    $value = $data[$key];
    if (!is_string($value)) {
        throw new InvalidArgumentException("{$key} must be a string");
    }
    $value = trim($value);
    if ($value === '') {
        return null;
    }
    if (strlen($value) > $maxLen) {
        throw new InvalidArgumentException("{$key} exceeds the maximum length");
    }
    if (preg_match('/[\r\n]/', $value) === 1) {
        throw new InvalidArgumentException("{$key} contains a CR or LF byte");
    }
    return $value;
}

/**
 * Builds the Subject line for a validated, per-type message. Mirrors the
 * exact labels the previous Node-side implementation used, so existing
 * mailbox filters/rules keep matching.
 */
function relay_build_subject(string $type, ?string $subject, ?string $name, ?string $feedbackType): string
{
    switch ($type) {
        case 'contact':
            return $subject !== null
                ? "[Contact] {$subject}"
                : '[Contact] Message from ' . ($name ?? 'website visitor');
        case 'support':
            return '[Support] New message from Help & Support';
        case 'feedback':
            $typeLabel = $feedbackType !== null
                ? (mb_strtoupper(mb_substr($feedbackType, 0, 1)) . mb_substr($feedbackType, 1))
                : 'Feedback';
            return $subject !== null
                ? "[Feedback/{$typeLabel}] {$subject}"
                : "[Feedback/{$typeLabel}] New submission";
        default:
            return '[Kivora]';
    }
}

/**
 * Builds the plain-text body for a validated, per-type message — preserves
 * every field the previous implementation included per type.
 */
function relay_build_body(
    string $type,
    ?string $name,
    ?string $email,
    ?string $subject,
    ?string $uid,
    bool $mayContact,
    string $message,
    ?string $feedbackType
): string {
    $lines = [];
    switch ($type) {
        case 'contact':
            $lines[] = "From: {$name} <{$email}>";
            if ($subject !== null) {
                $lines[] = "Subject: {$subject}";
            }
            break;
        case 'support':
            if ($uid !== null) {
                $lines[] = "User UID: {$uid}";
            }
            break;
        case 'feedback':
            $lines[] = 'Type: ' . ($feedbackType ?? 'feedback');
            if ($subject !== null) {
                $lines[] = "Subject: {$subject}";
            }
            if ($email !== null) {
                $lines[] = "Email: {$email}";
            }
            if ($uid !== null) {
                $lines[] = "User UID: {$uid}";
            }
            if ($mayContact) {
                $lines[] = 'May contact: Yes';
            }
            break;
    }
    $lines[] = '';
    $lines[] = $message;

    return implode("\n", $lines);
}

/**
 * The entire request-handling flow, as a function of explicit inputs
 * (never $_SERVER/php://input directly) returning an explicit
 * {status, body} result (never echoing/exiting directly). This is what
 * makes the whole flow — method gate, size/content-type gates, auth,
 * validation, fixed recipient mapping, header building — unit-testable
 * with plain PHP assertions and a fake mail sender, with no real HTTP
 * request and no real mail() call.
 *
 * $input keys:
 *   method, contentType, contentLength, authHeader, rawBody, secretPath,
 *   mailSender (callable(string $to, string $subject, string $body, string $headers): bool;
 *               defaults to the real mail() when omitted)
 */
function relay_handle_request(array $input): array
{
    $method = $input['method'] ?? '';
    if ($method !== 'POST') {
        return ['status' => 405, 'body' => ['ok' => false, 'error' => 'Method not allowed']];
    }

    // Size and content-type are checked before any auth/filesystem work —
    // cheap rejections for the cheapest classes of bad/hostile request.
    $contentLength = $input['contentLength'] ?? null;
    if ($contentLength === null || $contentLength <= 0 || $contentLength > MAIL_RELAY_MAX_BODY_BYTES) {
        return ['status' => 413, 'body' => ['ok' => false, 'error' => 'Invalid request']];
    }

    $contentType = $input['contentType'] ?? '';
    if (stripos($contentType, 'application/json') !== 0) {
        return ['status' => 400, 'body' => ['ok' => false, 'error' => 'Invalid request']];
    }

    // ── Secret / auth ───────────────────────────────────────────────────
    $secretPath = $input['secretPath'] ?? '';
    if ($secretPath === '' || !is_file($secretPath)) {
        return ['status' => 500, 'body' => ['ok' => false, 'error' => 'Service unavailable']];
    }
    $secretConfig = require $secretPath;
    if (!is_array($secretConfig) || empty($secretConfig['secret']) || !is_string($secretConfig['secret'])) {
        return ['status' => 500, 'body' => ['ok' => false, 'error' => 'Service unavailable']];
    }
    $expectedSecret = $secretConfig['secret'];
    // Fail closed on the published placeholder, or on any value that isn't
    // exactly 64 lowercase hex characters — BEFORE ever reaching
    // hash_equals(). A forgotten copy-without-editing of
    // secret.example.php, or any other malformed secret, must never become
    // a working credential.
    if (!relay_is_valid_secret_format($expectedSecret)) {
        return ['status' => 500, 'body' => ['ok' => false, 'error' => 'Service unavailable']];
    }

    $authHeader = $input['authHeader'] ?? '';
    if (!preg_match('/^Bearer\s+(.+)$/', $authHeader, $m) || !hash_equals($expectedSecret, $m[1])) {
        return ['status' => 401, 'body' => ['ok' => false, 'error' => 'Unauthorized']];
    }

    // ── Body parsing ────────────────────────────────────────────────────
    $rawBody = $input['rawBody'] ?? '';
    if (!is_string($rawBody) || $rawBody === '' || strlen($rawBody) > MAIL_RELAY_MAX_BODY_BYTES) {
        return ['status' => 400, 'body' => ['ok' => false, 'error' => 'Invalid request']];
    }
    $data = json_decode($rawBody, true);
    if (!is_array($data)) {
        return ['status' => 400, 'body' => ['ok' => false, 'error' => 'Invalid request']];
    }

    $type = $data['type'] ?? null;
    if (!is_string($type) || !in_array($type, MAIL_RELAY_ALLOWED_TYPES, true)) {
        return ['status' => 400, 'body' => ['ok' => false, 'error' => 'Invalid request']];
    }

    $message = $data['message'] ?? null;
    if (!is_string($message)) {
        return ['status' => 400, 'body' => ['ok' => false, 'error' => 'Invalid request']];
    }
    $message = trim($message);
    if ($message === '' || strlen($message) > MAIL_RELAY_MAX_MESSAGE_BYTES) {
        return ['status' => 400, 'body' => ['ok' => false, 'error' => 'Invalid request']];
    }

    try {
        $name         = relay_validate_header_field($data, 'name', 100);
        $email        = relay_validate_header_field($data, 'email', 320);
        $subject      = relay_validate_header_field($data, 'subject', 200);
        $feedbackType = relay_validate_header_field($data, 'feedbackType', 50);
        $uid          = relay_validate_header_field($data, 'uid', 200);
    } catch (InvalidArgumentException $e) {
        return ['status' => 400, 'body' => ['ok' => false, 'error' => 'Invalid request']];
    }
    $mayContact = !empty($data['mayContact']);

    if ($email !== null && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        return ['status' => 400, 'body' => ['ok' => false, 'error' => 'Invalid request']];
    }

    // Per-type required fields — defense in depth; the Render-side routes
    // already validate this too, but the relay never trusts the caller.
    if ($type === 'contact' && ($name === null || $email === null)) {
        return ['status' => 400, 'body' => ['ok' => false, 'error' => 'Invalid request']];
    }

    // ── Fixed server-side recipient/sender mapping — ignores any to/from/
    //    recipient the caller might have sent. ───────────────────────────
    $to = MAIL_RELAY_RECIPIENTS[$type];
    $fromDisplay = MAIL_RELAY_FROM_DISPLAY_NAMES[$type];

    $replyTo = null;
    if ($type === 'contact' && $email !== null) {
        $replyTo = $email;
    } elseif ($type === 'feedback' && $mayContact && $email !== null) {
        $replyTo = $email;
    }
    // support: intentionally never gets a Reply-To.

    $subjectLine = relay_build_subject($type, $subject, $name, $feedbackType);
    $body = relay_build_body($type, $name, $email, $subject, $uid, $mayContact, $message, $feedbackType);

    $headers = [];
    $headers[] = 'From: ' . relay_mime_encode_header($fromDisplay) . ' <' . MAIL_RELAY_FROM_ADDRESS . '>';
    if ($replyTo !== null) {
        $headers[] = "Reply-To: {$replyTo}";
    }
    $headers[] = 'MIME-Version: 1.0';
    $headers[] = 'Content-Type: text/plain; charset=UTF-8';
    $headerString = implode("\r\n", $headers);

    $mailSender = $input['mailSender'] ?? 'mail';
    $sent = $mailSender($to, relay_mime_encode_header($subjectLine), $body, $headerString);
    if (!$sent) {
        return ['status' => 502, 'body' => ['ok' => false, 'error' => 'Delivery failed']];
    }

    return ['status' => 200, 'body' => ['ok' => true]];
}

// ── Bootstrap — only runs as the real, directly-requested script. The
//    test harness defines MAIL_RELAY_TEST_MODE before require()-ing this
//    file, so none of this executes during tests. ──────────────────────
if (!defined('MAIL_RELAY_TEST_MODE')) {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($authHeader === '' && function_exists('apache_request_headers')) {
        // Some Apache/PHP-FPM configurations strip the Authorization header
        // from $_SERVER before PHP sees it; apache_request_headers() is the
        // documented fallback. Verify which behavior applies on the real
        // Zone account before relying on either path alone.
        $apacheHeaders = apache_request_headers();
        $authHeader = $apacheHeaders['Authorization'] ?? ($apacheHeaders['authorization'] ?? '');
    }

    $result = relay_handle_request([
        'method'        => $_SERVER['REQUEST_METHOD'] ?? '',
        'contentType'   => $_SERVER['CONTENT_TYPE'] ?? '',
        'contentLength' => isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : null,
        'authHeader'    => $authHeader,
        // Read at most MAX_BODY_BYTES + 1 so an oversized body is detected
        // (length > MAX_BODY_BYTES) without ever buffering an unbounded
        // amount of attacker-controlled input into memory first.
        'rawBody'       => (string) file_get_contents('php://input', false, null, 0, MAIL_RELAY_MAX_BODY_BYTES + 1),
        // htdocs/mail-relay/relay.php -> dirname(__DIR__, 2) is the account
        // root (htdocs/mail-relay -> htdocs -> account root), i.e. the
        // sibling of htdocs/ that is never served over HTTP.
        'secretPath'    => dirname(__DIR__, 2) . '/mail-relay-secret.php',
        'mailSender'    => 'mail',
    ]);

    http_response_code($result['status']);
    header('Content-Type: application/json');
    echo json_encode($result['body']);
}
