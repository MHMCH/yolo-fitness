// Teams per quarter (key `YYYY-Qn`), listed by account UUID from `npm run users`. Never use emails here: this file ships in the public bundle.
export type LeagueConfig = Record<string, string[][]>

const seba: string = '8a5fcf93-5b4d-4b87-ad9f-8c8f3b012684'
const jonas: string = '8a5fcf93-5b4d-4b87-ad9f-8c8f3b012684'
const phillip: string = '8a5fcf93-5b4d-4b87-ad9f-8c8f3b012684'
const torben: string = '8a5fcf93-5b4d-4b87-ad9f-8c8f3b012684'
const daniel: string = '8a5fcf93-5b4d-4b87-ad9f-8c8f3b012684'
const tobi: string = '8a5fcf93-5b4d-4b87-ad9f-8c8f3b012684'
const joerg: string = '8a5fcf93-5b4d-4b87-ad9f-8c8f3b012684'
const marco: string = '8a5fcf93-5b4d-4b87-ad9f-8c8f3b012684'
const max: string = '8a5fcf93-5b4d-4b87-ad9f-8c8f3b012684'
const jens: string = '8a5fcf93-5b4d-4b87-ad9f-8c8f3b012684'
const axel: string = '8a5fcf93-5b4d-4b87-ad9f-8c8f3b012684'

export const league: LeagueConfig = {
  '2026-Q4': [
    [seba, jonas, phillip], // Seba & Jonas & Philipp
    [torben, daniel], // Torben & Daniel
    [tobi, marco], // Tobi & Marco
    [max, axel], // Max & Axel
    [jens, joerg] // Jens & Jörg
  ],
  '2027-Q1': [
    [marco, max, jonas],
    [daniel, phillip],
    [jens, axel],
    [joerg, seba],
    [tobi, torben]
  ],
  '2027-Q2': [
    [joerg, daniel, tobi],
    [jens, seba],
    [jonas, axel],
    [marco, torben],
    [max, phillip]
  ],
  '2027-Q3': [
    [jens, marco, daniel],
    [jonas, torben],
    [tobi, phillip],
    [joerg, max],
    [seba, axel]
  ],
}
