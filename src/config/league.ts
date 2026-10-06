// Teams per quarter (key `YYYY-Qn`), listed by account UUID from `npm run users`. Never use emails here: this file ships in the public bundle.
export type LeagueConfig = Record<string, string[][]>

export const league: LeagueConfig = {
  '2026-Q4': [
    ['8a5fcf93-5b4d-4b87-ad9f-8c8f3b012684', '8c20af09-5122-4e2c-a897-b1f9214825ef', 'e964faae-99ee-45c7-83ec-8e7613e2d756'], // Seba & Jonas & Philipp
    ['3d9538af-7e93-4a8a-9fd5-7c246739c19a', 'ed331540-bae8-4806-8fae-07607274bb79'], // Torben & Daniel
    ['0ddd36d9-4387-4aac-b320-d1e9d469a7be', 'bcbe8d37-93fe-4a1e-88e1-133161468a62'], // Tobi & Marco
    ['60fe5941-872a-4fc8-9001-926cb16bb4e6', '1bfabde0-2d45-49f0-997c-acd364b80ee8'], // Max & Axel
    ['05c2bbc0-c81e-459e-9f0c-09bb516fbe2c', 'b9d0ec29-1a27-4a84-8223-ab43718aadb6'] // Jens & Jörg
  ],
}
