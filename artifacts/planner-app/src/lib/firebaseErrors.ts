import type { FirebaseError } from 'firebase/app'

const errorMap: Record<string, string> = {
  'auth/email-already-in-use': 'See e-posti aadress on juba kasutusel.',
  'auth/invalid-email': 'Vigane e-posti aadress.',
  'auth/weak-password': 'Parool on liiga nõrk. Kasuta vähemalt 8 tähemärki.',
  'auth/too-many-requests': 'Liiga palju katseid. Proovi hiljem uuesti.',
  'auth/network-request-failed': 'Võrguühenduse probleem. Kontrolli internetiühendust.',
  'auth/popup-closed-by-user': 'Google\'i sisselogimise aken suleti.',
  'auth/cancelled-popup-request': 'Google\'i sisselogimine tühistati.',
  'auth/operation-not-allowed': 'See autentimismeetod pole lubatud.',
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
  'auth/popup-blocked': 'Hüpikaken blokeeriti. Luba hüpikaknad ja proovi uuesti.',
  'auth/credential-already-in-use': 'See konto on juba seotud teise sisselogimisviisiga.',
  'auth/provider-not-found': 'Google\'i sisselogimine pole Firebase\'is seadistatud.',
  'auth/operation-not-supported-in-this-environment': 'See sisselogimismeetod pole selles keskkonnas toetatud.',
  'redirect-error': 'Google\'i sisselogimisel tekkis viga. Proovi uuesti.',
}

export function mapFirebaseError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as FirebaseError).code
    if (code && errorMap[code]) return errorMap[code]
  }
  return 'Tekkis ootamatu viga. Proovi hiljem uuesti.'
}
