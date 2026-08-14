import type { FirebaseError } from 'firebase/app'

const errorMap: Record<string, string> = {
  'auth/email-already-in-use': 'See e-posti aadress on juba kasutusel.',
  'auth/invalid-email': 'Vigane e-posti aadress.',
  'auth/weak-password': 'Parool on liiga nõrk. Kasuta vähemalt 8 tähemärki.',
  'auth/too-many-requests': 'Liiga palju katseid. Proovi hiljem uuesti.',
  'auth/network-request-failed': 'Võrguühenduse probleem. Kontrolli internetiühendust.',
  'auth/popup-closed-by-user': 'Sisselogimise aken suleti. Proovi uuesti.',
  'auth/cancelled-popup-request': 'Sisselogimine tühistati.',
  'auth/popup-blocked': 'Hüpikaken blokeeriti. Luba hüpikaknad ja proovi uuesti.',
  'auth/web-storage-unsupported': 'Brauser blokeerib kolmandate osapoolte küpsised, mis on sisselogimiseks vajalikud. Luba küpsised või proovi teise brauseriga.',
  'auth/configuration-not-found': 'Autentimise seadistus puudub. Võta ühendust rakenduse haldajaga.',
  'auth/operation-not-allowed': 'See autentimismeetod pole lubatud.',
  'auth/unauthorized-domain': 'See domeen pole Firebase autentimisel lubatud. Lisa kivora.ee Firebase Console → Authentication → Settings → Authorized Domains.',
  'auth/user-disabled': 'See konto on deaktiveeritud.',
  'auth/user-not-found': 'E-posti aadress või parool on vale.',
  'auth/wrong-password': 'E-posti aadress või parool on vale.',
  'auth/invalid-credential': 'E-posti aadress või parool on vale.',
  'auth/missing-password': 'Sisesta parool.',
  'auth/account-exists-with-different-credential': 'See konto on juba seotud teise sisselogimismeetodiga.',
  'auth/requires-recent-login': 'Sisselogimine on aegunud. Logi uuesti sisse ja proovi veel kord.',
  'auth/expired-action-code': 'Link on aegunud.',
  'auth/invalid-action-code': 'Link on vigane või aegunud.',
  'auth/invalid-verification-code': 'Kinnituskood on vigane.',
  'auth/unverified-email': 'E-posti aadress pole kinnitatud.',
  'auth/credential-already-in-use': 'See konto on juba seotud teise sisselogimisviisiga.',
  'auth/provider-not-found': 'Google\'i sisselogimine pole Firebase\'is seadistatud.',
  'auth/operation-not-supported-in-this-environment': 'See sisselogimismeetod pole selles keskkonnas toetatud.',
  'redirect-error': 'Sisselogimisel tekkis viga. Proovi uuesti.',
}

export function mapFirebaseError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as FirebaseError).code
    if (code && errorMap[code]) return errorMap[code]
    // Surface unknown error codes explicitly so they are visible in the UI during diagnosis.
    // TODO: remove the raw-code fallback once auth is confirmed working on kivora.ee.
    if (code) return `Sisselogimine ebaõnnestus (${code})`
  }
  return 'Tekkis ootamatu viga. Proovi hiljem uuesti.'
}
