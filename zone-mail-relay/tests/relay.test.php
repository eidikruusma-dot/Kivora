<?php

declare(strict_types=1);

/**
 * Plain-PHP CLI tests for relay.php — no framework dependency, since Zone
 * shared hosting may not offer PHPUnit. Mirrors the hand-rolled
 * assert/group style already used for the Node-side tests in this repo.
 *
 * Every call goes through relay_handle_request() with explicit inputs
 * (never real superglobals, never php://input, never a real mail()) — see
 * relay.php's own docblock for why that function takes its inputs as
 * parameters instead of reading globals directly.
 *
 * Run:
 *   php zone-mail-relay/tests/relay.test.php
 */

define('MAIL_RELAY_TEST_MODE', true);
require __DIR__ . '/../relay.php';

$passed = 0;
$failed = 0;

function relay_test_assert(bool $condition, string $label): void
{
    global $passed, $failed;
    if ($condition) {
        echo "  ✓ {$label}\n";
        $passed++;
    } else {
        echo "  ✗ FAILED: {$label}\n";
        $failed++;
    }
}

function relay_test_group(string $name): void
{
    echo "\n{$name}\n";
}

function relay_test_write_secret_file(string $path, string $secret): void
{
    file_put_contents($path, "<?php\nreturn ['secret' => " . var_export($secret, true) . "];\n");
}

function relay_test_write_invalid_secret_file(string $path, $contents): void
{
    file_put_contents($path, "<?php\nreturn " . var_export($contents, true) . ";\n");
}

$tmpDir = sys_get_temp_dir() . '/relay-test-' . bin2hex(random_bytes(4));
mkdir($tmpDir);

// A deliberately obvious, fixed test pattern — NOT generated with
// `openssl rand -hex 32`, and never used anywhere outside this test file.
// It only needs to satisfy the format check (64 lowercase hex chars) so
// the rest of the suite can exercise the real request-handling logic;
// it must never be mistaken for, or reused as, a real production secret.
$VALID_TEST_SECRET = str_repeat('a1', 32);

$secretPath = $tmpDir . '/mail-relay-secret.php';
relay_test_write_secret_file($secretPath, $VALID_TEST_SECRET);

$missingSecretPath = $tmpDir . '/does-not-exist.php';

$invalidSecretPath = $tmpDir . '/mail-relay-secret-invalid.php';
relay_test_write_invalid_secret_file($invalidSecretPath, 'not-an-array');

$emptySecretPath = $tmpDir . '/mail-relay-secret-empty.php';
relay_test_write_invalid_secret_file($emptySecretPath, ['secret' => '']);

/**
 * @param array<string, mixed> $overrides
 * @return array<string, mixed>
 */
function relay_test_base_input(string $secretPath, array $overrides = []): array
{
    global $VALID_TEST_SECRET;
    $defaults = [
        'method'        => 'POST',
        'contentType'   => 'application/json',
        'contentLength' => 100,
        'authHeader'    => 'Bearer ' . $VALID_TEST_SECRET,
        'rawBody'       => json_encode(['type' => 'support', 'message' => 'hello']),
        'secretPath'    => $secretPath,
        'mailSender'    => function (...$args) {
            return true;
        },
    ];
    return array_merge($defaults, $overrides);
}

// ── 1. Method gate — a browser GET must never reach mail() ────────────────

relay_test_group('1. Method gate');
$r = relay_handle_request(relay_test_base_input($secretPath, ['method' => 'GET']));
relay_test_assert($r['status'] === 405, 'GET is rejected with 405');
relay_test_assert($r['body']['ok'] === false, 'GET response has ok:false');

$mailCalled = false;
$spy = function (...$args) use (&$mailCalled) {
    $mailCalled = true;
    return true;
};
relay_handle_request(relay_test_base_input($secretPath, ['method' => 'GET', 'mailSender' => $spy]));
relay_test_assert($mailCalled === false, 'GET never calls the mail sender');

foreach (['HEAD', 'PUT', 'DELETE', 'OPTIONS'] as $method) {
    $r = relay_handle_request(relay_test_base_input($secretPath, ['method' => $method]));
    relay_test_assert($r['status'] === 405, "{$method} is also rejected with 405");
}

// ── 2. Content-Type gate ────────────────────────────────────────────────────

relay_test_group('2. Content-Type gate');
$r = relay_handle_request(relay_test_base_input($secretPath, ['contentType' => 'text/plain']));
relay_test_assert($r['status'] === 400, 'non-JSON content-type rejected with 400');
$r = relay_handle_request(relay_test_base_input($secretPath, ['contentType' => 'application/x-www-form-urlencoded']));
relay_test_assert($r['status'] === 400, 'form-urlencoded content-type rejected with 400');

// ── 3. Body size limit ──────────────────────────────────────────────────────

relay_test_group('3. Body size limit');
$r = relay_handle_request(relay_test_base_input($secretPath, ['contentLength' => 999999]));
relay_test_assert($r['status'] === 413, 'oversized Content-Length rejected with 413');
$r = relay_handle_request(relay_test_base_input($secretPath, ['contentLength' => 0]));
relay_test_assert($r['status'] === 413, 'zero Content-Length rejected with 413');
$r = relay_handle_request(relay_test_base_input($secretPath, ['contentLength' => null]));
relay_test_assert($r['status'] === 413, 'missing Content-Length rejected with 413');

// ── 4. Authorization — constant-time comparison, generic 401 ───────────────

relay_test_group('4. Authorization');
$r = relay_handle_request(relay_test_base_input($secretPath, ['authHeader' => '']));
relay_test_assert($r['status'] === 401, 'missing Authorization header -> 401');
$r = relay_handle_request(relay_test_base_input($secretPath, ['authHeader' => 'Bearer wrong-secret']));
relay_test_assert($r['status'] === 401, 'wrong secret -> 401');
$r = relay_handle_request(relay_test_base_input($secretPath, ['authHeader' => 'Basic dXNlcjpwYXNz']));
relay_test_assert($r['status'] === 401, 'non-Bearer scheme -> 401');
$r = relay_handle_request(relay_test_base_input($secretPath, ['authHeader' => 'Bearer']));
relay_test_assert($r['status'] === 401, '"Bearer" with no token -> 401');

// ── 5. Secret file fails closed ─────────────────────────────────────────────

relay_test_group('5. Secret file fails closed when missing or malformed');
$r = relay_handle_request(relay_test_base_input($secretPath, ['secretPath' => $missingSecretPath]));
relay_test_assert($r['status'] === 500, 'missing secret file -> 500, not a crash, not a pass-through');
$r = relay_handle_request(relay_test_base_input($secretPath, ['secretPath' => $invalidSecretPath]));
relay_test_assert($r['status'] === 500, 'secret file not returning an array -> 500');
$r = relay_handle_request(relay_test_base_input($secretPath, ['secretPath' => $emptySecretPath]));
relay_test_assert($r['status'] === 500, 'secret file with an empty secret value -> 500');

// ── 5b. Secret FORMAT validation — fails closed BEFORE hash_equals, never
//        trims/normalizes an invalid value into validity ──────────────────

relay_test_group('5b. Secret format validation (exactly 64 lowercase hex characters)');

// The exact published placeholder must be rejected explicitly, by name —
// not just because it happens to fail the format check.
$placeholderSecretPath = $tmpDir . '/mail-relay-secret-placeholder.php';
relay_test_write_secret_file($placeholderSecretPath, 'REPLACE_WITH_A_REAL_HIGH_ENTROPY_SECRET');
$r = relay_handle_request(relay_test_base_input($secretPath, [
    'secretPath' => $placeholderSecretPath,
    'authHeader' => 'Bearer REPLACE_WITH_A_REAL_HIGH_ENTROPY_SECRET',
]));
relay_test_assert($r['status'] === 500, 'the published secret.example.php placeholder is rejected, never accepted as a valid secret');
@unlink($placeholderSecretPath);

$badSecrets = [
    'empty'             => '',
    'short'             => str_repeat('a', 10),
    'long (65 chars)'   => str_repeat('a', 65),
    'uppercase hex'     => str_repeat('A1', 32),
    'whitespace-padded' => ' ' . $VALID_TEST_SECRET . ' ',
    'non-hex characters' => str_repeat('g', 64),
];
foreach ($badSecrets as $label => $badSecret) {
    $slug = preg_replace('/[^a-z0-9]/', '', strtolower($label));
    $badSecretPath = $tmpDir . "/mail-relay-secret-bad-{$slug}.php";
    relay_test_write_secret_file($badSecretPath, $badSecret);
    $r = relay_handle_request(relay_test_base_input($secretPath, [
        'secretPath' => $badSecretPath,
        'authHeader' => 'Bearer ' . $badSecret,
    ]));
    relay_test_assert($r['status'] === 500, "a {$label} secret is rejected (not accepted, not trimmed/normalized into validity)");
    @unlink($badSecretPath);
}

// A secret exactly matching the required format succeeds end-to-end.
$r = relay_handle_request(relay_test_base_input($secretPath));
relay_test_assert($r['status'] === 200, 'a valid 64-character lowercase hex secret is accepted and the request succeeds');

// ── 6. JSON body parsing ─────────────────────────────────────────────────────

relay_test_group('6. JSON body parsing');
$r = relay_handle_request(relay_test_base_input($secretPath, ['rawBody' => 'not json']));
relay_test_assert($r['status'] === 400, 'malformed JSON -> 400');
$r = relay_handle_request(relay_test_base_input($secretPath, ['rawBody' => '"just a string"']));
relay_test_assert($r['status'] === 400, 'valid JSON but not an object -> 400');
$r = relay_handle_request(relay_test_base_input($secretPath, ['rawBody' => '']));
relay_test_assert($r['status'] === 400, 'empty body -> 400');

// ── 7. type allowlist ───────────────────────────────────────────────────────

relay_test_group('7. type allowlist');
$r = relay_handle_request(relay_test_base_input($secretPath, [
    'rawBody' => json_encode(['type' => 'admin', 'message' => 'x']),
]));
relay_test_assert($r['status'] === 400, 'unknown type rejected');
$r = relay_handle_request(relay_test_base_input($secretPath, [
    'rawBody' => json_encode(['message' => 'x']),
]));
relay_test_assert($r['status'] === 400, 'missing type rejected');

// ── 8. message required, length-limited (CR/LF allowed in the body) ────────

relay_test_group('8. message required and length-limited');
$r = relay_handle_request(relay_test_base_input($secretPath, [
    'rawBody' => json_encode(['type' => 'support']),
]));
relay_test_assert($r['status'] === 400, 'missing message -> 400');
$r = relay_handle_request(relay_test_base_input($secretPath, [
    'rawBody' => json_encode(['type' => 'support', 'message' => '   ']),
]));
relay_test_assert($r['status'] === 400, 'whitespace-only message -> 400');
$tooLong = str_repeat('a', 8001);
$r = relay_handle_request(relay_test_base_input($secretPath, [
    'rawBody' => json_encode(['type' => 'support', 'message' => $tooLong]),
]));
relay_test_assert($r['status'] === 400, 'over-length message -> 400');

$captured = null;
$spy = function ($to, $subject, $body, $headers) use (&$captured) {
    $captured = $body;
    return true;
};
$multilineMessage = "Line one\nLine two\n\nLine four";
relay_handle_request(relay_test_base_input($secretPath, [
    'rawBody'    => json_encode(['type' => 'support', 'message' => $multilineMessage]),
    'mailSender' => $spy,
]));
relay_test_assert(strpos($captured, "Line one\nLine two") !== false, 'a legitimately multi-line message body is preserved, not rejected');

// ── 9. contact requires name+email ──────────────────────────────────────────

relay_test_group('9. contact requires name and email');
$r = relay_handle_request(relay_test_base_input($secretPath, [
    'rawBody' => json_encode(['type' => 'contact', 'message' => 'hi']),
]));
relay_test_assert($r['status'] === 400, 'contact without name/email -> 400');
$r = relay_handle_request(relay_test_base_input($secretPath, [
    'rawBody' => json_encode(['type' => 'contact', 'name' => 'A', 'message' => 'hi']),
]));
relay_test_assert($r['status'] === 400, 'contact without email -> 400');

// ── 10. CR/LF rejection in header-bound fields ──────────────────────────────

relay_test_group('10. CR/LF rejection in header-bound fields (mail header injection)');
foreach (['name', 'subject', 'feedbackType'] as $field) {
    $payload = ['type' => 'contact', 'name' => 'A', 'email' => 'a@example.com', 'message' => 'hi'];
    $payload[$field] = "evil\r\nBcc: attacker@example.com";
    $r = relay_handle_request(relay_test_base_input($secretPath, ['rawBody' => json_encode($payload)]));
    relay_test_assert($r['status'] === 400, "CRLF in {$field} is rejected");
}
// \n alone (no \r) must also be rejected — not just the \r\n pair.
$payload = ['type' => 'contact', 'name' => "evil\nBcc: attacker@example.com", 'email' => 'a@example.com', 'message' => 'hi'];
$r = relay_handle_request(relay_test_base_input($secretPath, ['rawBody' => json_encode($payload)]));
relay_test_assert($r['status'] === 400, 'a bare LF (no CR) in a header-bound field is also rejected');

// ── 11. email format validation ─────────────────────────────────────────────

relay_test_group('11. email format validation');
$r = relay_handle_request(relay_test_base_input($secretPath, [
    'rawBody' => json_encode(['type' => 'contact', 'name' => 'A', 'email' => 'not-an-email', 'message' => 'hi']),
]));
relay_test_assert($r['status'] === 400, 'invalid email format rejected');

// ── 12. fixed recipient/sender mapping — never taken from the request ──────

relay_test_group('12. fixed recipient/sender mapping is never taken from the request body');
$captured = null;
$spy = function ($to, $subject, $body, $headers) use (&$captured) {
    $captured = compact('to', 'subject', 'body', 'headers');
    return true;
};
$payload = [
    'type'    => 'contact',
    'name'    => 'Attacker',
    'email'   => 'attacker@example.com',
    'message' => 'hi',
    // Neither of these must ever be honoured:
    'to'      => 'victim@somewhere.com',
    'from'    => 'spoof@evil.com',
];
$r = relay_handle_request(relay_test_base_input($secretPath, ['rawBody' => json_encode($payload), 'mailSender' => $spy]));
relay_test_assert($r['status'] === 200, 'contact with extra to/from fields still succeeds');
relay_test_assert($captured['to'] === 'info@kivora.ee', 'the ACTUAL recipient is the fixed info@kivora.ee, ignoring the caller-supplied "to"');
relay_test_assert(strpos($captured['headers'], 'noreply@kivora.ee') !== false, 'the ACTUAL From address is the fixed noreply@kivora.ee, ignoring the caller-supplied "from"');
relay_test_assert(strpos($captured['headers'], 'spoof@evil.com') === false, 'the caller-supplied spoofed From address never appears anywhere in the real headers');

relay_test_group('12b. recipient mapping per type');
$expectedRecipients = ['contact' => 'info@kivora.ee', 'support' => 'support@kivora.ee', 'feedback' => 'support@kivora.ee'];
foreach ($expectedRecipients as $t => $expected) {
    $captured = null;
    $spy = function ($to) use (&$captured) {
        $captured = $to;
        return true;
    };
    $payload = ['type' => $t, 'message' => 'hi'];
    if ($t === 'contact') {
        $payload['name'] = 'A';
        $payload['email'] = 'a@example.com';
    }
    relay_handle_request(relay_test_base_input($secretPath, ['rawBody' => json_encode($payload), 'mailSender' => $spy]));
    relay_test_assert($captured === $expected, "{$t} routes to {$expected}");
}

// ── 13. Reply-To derivation rules ───────────────────────────────────────────

relay_test_group('13. Reply-To: contact always, feedback only when mayContact+valid email, support never');
$captured = null;
$spy = function ($to, $subject, $body, $headers) use (&$captured) {
    $captured = $headers;
    return true;
};

relay_handle_request(relay_test_base_input($secretPath, [
    'rawBody'    => json_encode(['type' => 'support', 'message' => 'hi']),
    'mailSender' => $spy,
]));
relay_test_assert(strpos($captured, 'Reply-To:') === false, 'support never gets a Reply-To header');

relay_handle_request(relay_test_base_input($secretPath, [
    'rawBody'    => json_encode(['type' => 'contact', 'name' => 'A', 'email' => 'a@example.com', 'message' => 'hi']),
    'mailSender' => $spy,
]));
relay_test_assert(strpos($captured, 'Reply-To: a@example.com') !== false, 'contact sets Reply-To to the submitter email');

relay_handle_request(relay_test_base_input($secretPath, [
    'rawBody'    => json_encode(['type' => 'feedback', 'message' => 'hi', 'email' => 'f@example.com', 'mayContact' => true]),
    'mailSender' => $spy,
]));
relay_test_assert(strpos($captured, 'Reply-To: f@example.com') !== false, 'feedback sets Reply-To when mayContact is true and email is valid');

relay_handle_request(relay_test_base_input($secretPath, [
    'rawBody'    => json_encode(['type' => 'feedback', 'message' => 'hi', 'email' => 'f@example.com', 'mayContact' => false]),
    'mailSender' => $spy,
]));
relay_test_assert(strpos($captured, 'Reply-To:') === false, 'feedback has no Reply-To when mayContact is false');

relay_handle_request(relay_test_base_input($secretPath, [
    'rawBody'    => json_encode(['type' => 'feedback', 'message' => 'hi', 'mayContact' => true]),
    'mailSender' => $spy,
]));
relay_test_assert(strpos($captured, 'Reply-To:') === false, 'feedback has no Reply-To when mayContact is true but no email was given');

// ── 14. Non-ASCII header encoding (RFC 2047) ────────────────────────────────

relay_test_group('14. non-ASCII subject/name is RFC 2047 (MIME) encoded, not raw UTF-8 bytes');
$captured = null;
$spy = function ($to, $subject, $body, $headers) use (&$captured) {
    $captured = ['subject' => $subject, 'headers' => $headers];
    return true;
};
relay_handle_request(relay_test_base_input($secretPath, [
    'rawBody'    => json_encode([
        'type'    => 'contact',
        'name'    => 'Õie Müür',
        'email'   => 'a@example.com',
        'message' => 'hi',
        'subject' => 'Päring kütte kohta',
    ]),
    'mailSender' => $spy,
]));
relay_test_assert(
    stripos($captured['subject'], '=?UTF-8?B?') !== false,
    'a non-ASCII subject is MIME-encoded (RFC 2047), not sent as raw UTF-8 bytes in the header',
);
// The body (a plain text part, not a header) legitimately keeps raw UTF-8 —
// only HEADER values need RFC 2047 encoding.
$captured2 = null;
$spy2 = function ($to, $subject, $body, $headers) use (&$captured2) {
    $captured2 = $body;
    return true;
};
relay_handle_request(relay_test_base_input($secretPath, [
    'rawBody'    => json_encode(['type' => 'contact', 'name' => 'Õie Müür', 'email' => 'a@example.com', 'message' => 'Tere, palun vastake.']),
    'mailSender' => $spy2,
]));
relay_test_assert(strpos($captured2, 'Õie Müür') !== false, 'the message body keeps raw UTF-8 (it is a body part, not a header)');

// ── 15. Delivery failure surfaces as 502, never a false success ────────────

relay_test_group('15. delivery failure (mail() returns false) -> 502, never ok:true');
$spy = function (...$args) {
    return false;
};
$r = relay_handle_request(relay_test_base_input($secretPath, ['mailSender' => $spy]));
relay_test_assert($r['status'] === 502, 'a failed mail() call returns 502');
relay_test_assert($r['body']['ok'] === false, 'a failed mail() call never reports ok:true');

// ── 16. Every field legitimately included in the previous implementation
//       survives into the generated body (contact/support/feedback) ───────

relay_test_group('16. every legitimate field from the previous implementation is preserved per type');
$captured = null;
$spy = function ($to, $subject, $body, $headers) use (&$captured) {
    $captured = ['subject' => $subject, 'body' => $body];
    return true;
};

relay_handle_request(relay_test_base_input($secretPath, [
    'rawBody'    => json_encode(['type' => 'contact', 'name' => 'Jane Doe', 'email' => 'jane@example.com', 'subject' => 'Hello there', 'message' => 'A question.']),
    'mailSender' => $spy,
]));
relay_test_assert(strpos($captured['body'], 'Jane Doe') !== false && strpos($captured['body'], 'jane@example.com') !== false, 'contact body includes name+email');
relay_test_assert(strpos($captured['body'], 'Subject: Hello there') !== false, 'contact body includes the subject line');
relay_test_assert(strpos($captured['body'], 'A question.') !== false, 'contact body includes the message');

relay_handle_request(relay_test_base_input($secretPath, [
    'rawBody'    => json_encode(['type' => 'support', 'message' => 'Help please', 'uid' => 'uid-123']),
    'mailSender' => $spy,
]));
relay_test_assert(strpos($captured['body'], 'uid-123') !== false, 'support body includes the User UID');
relay_test_assert(strpos($captured['body'], 'Help please') !== false, 'support body includes the message');

relay_handle_request(relay_test_base_input($secretPath, [
    'rawBody'    => json_encode([
        'type'         => 'feedback',
        'feedbackType' => 'bug',
        'subject'      => 'Broken button',
        'email'        => 'f@example.com',
        'uid'          => 'uid-456',
        'mayContact'   => true,
        'message'      => 'It crashes.',
    ]),
    'mailSender' => $spy,
]));
relay_test_assert(strpos($captured['body'], 'Type: bug') !== false, 'feedback body includes the feedback type/category');
relay_test_assert(strpos($captured['body'], 'Subject: Broken button') !== false, 'feedback body includes the subject');
relay_test_assert(strpos($captured['body'], 'Email: f@example.com') !== false, 'feedback body includes the email');
relay_test_assert(strpos($captured['body'], 'uid-456') !== false, 'feedback body includes the User UID');
relay_test_assert(strpos($captured['body'], 'May contact: Yes') !== false, 'feedback body includes the "may contact" flag');
relay_test_assert(strpos($captured['body'], 'It crashes.') !== false, 'feedback body includes the message');

// ── cleanup ──────────────────────────────────────────────────────────────

@unlink($secretPath);
@unlink($invalidSecretPath);
@unlink($emptySecretPath);
@rmdir($tmpDir);

echo "\n" . str_repeat('=', 48) . "\n";
echo "  relay.php: {$passed} passed, {$failed} failed\n";
echo str_repeat('=', 48) . "\n";

if ($failed > 0) {
    exit(1);
}
