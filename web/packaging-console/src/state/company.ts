/**
 * The legal entity behind the site, as it appears on the Companies House register (checked 2026-11-16). A UK company's website is generally expected to show its
 * registered name, registration number, place of registration and registered office address. Change them here only: the footer, the Privacy page and the
 * Disclaimer all read these constants. Add a VAT number here if the company registers for VAT.
 */
export const COMPANY = {
  name: 'GE App Solutions Limited',
  number: '16317660',
  registeredIn: 'England and Wales',
  office: '71-75 Shelton Street, Covent Garden, London, WC2H 9JQ',
}

/** One line for a footer or a legal notice. */
export function companyLine(): string {
  return `${COMPANY.name}, registered in ${COMPANY.registeredIn}, company number ${COMPANY.number}. Registered office: ${COMPANY.office}.`
}
