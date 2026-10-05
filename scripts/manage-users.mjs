import { randomInt } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'

class LocalAdminError extends Error {}

const help = `Local-only account administration (Node 22.12+)

  npm run users -- create EMAIL [NAME]
  npm run users -- reset UUID
  npm run users -- ban UUID
  npm run users -- unban UUID
  npm run users -- --help

Project URL and admin secret are prompted locally; secret input is hidden.
Alternatively set SUPABASE_URL and SUPABASE_SECRET_KEY in this local process.
Never use VITE variables, CI, passwords or secrets as command arguments.
Create/reset generate a new password and print it only after success.
Reset the existing UUID to preserve training history. Deliver credentials privately.
Ban blocks new sign-ins/refresh; an existing JWT can remain valid until expiry.
`

function parseArgs(args) {
  const [operation, identifier, name] = args
  if (!['create', 'reset', 'ban', 'unban'].includes(operation)) {
    throw new LocalAdminError('Choose create, reset, ban or unban; see --help.')
  }
  if (!identifier || args.length > (operation === 'create' ? 3 : 2)) {
    throw new LocalAdminError('Invalid arguments; only operation, email/UUID and optional create name are accepted.')
  }
  if (operation === 'create') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) throw new LocalAdminError('Provide an email identifier.')
    if (name !== undefined && (!name.trim() || name.trim().length > 40)) {
      throw new LocalAdminError('Display name must contain 1 to 40 characters.')
    }
  } else if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(identifier)) {
    throw new LocalAdminError('Provide the existing account UUID, not an email address.')
  }
  return { operation, identifier, name: name?.trim() }
}

async function prompt(label, hidden = false) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new LocalAdminError('Interactive prompts require a local TTY; otherwise supply the local process environment variables.')
  }
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!hidden) process.stdout.write(chunk, encoding)
      callback()
    },
  })
  const readline = createInterface({ input: process.stdin, output, terminal: true, historySize: 0 })
  const controller = new AbortController()
  readline.on('SIGINT', () => controller.abort())
  process.stdout.write(label)
  try {
    return (await readline.question('', { signal: controller.signal })).trim()
  } finally {
    readline.close()
    if (hidden) process.stdout.write('\n')
  }
}

function validateConnection(projectUrl, secret) {
  let url
  try { url = new URL(projectUrl) } catch { throw new LocalAdminError('Invalid Supabase project URL.') }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new LocalAdminError('Use an HTTPS project origin (or HTTP localhost), without credentials, paths or query parameters.')
  }
  let role
  try { role = JSON.parse(Buffer.from(secret.split('.')[1] ?? '', 'base64url').toString()).role } catch {}
  if (!secret.startsWith('sb_secret_') && role !== 'service_role') {
    throw new LocalAdminError('Use a local Supabase secret key or legacy service_role key, never a publishable/anon key.')
  }
  return url.origin
}

function generatePassword() {
  const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%*-_+']
  const alphabet = groups.join('')
  const characters = groups.map(group => group[randomInt(group.length)])
  while (characters.length < 32) characters.push(alphabet[randomInt(alphabet.length)])
  for (let index = characters.length - 1; index > 0; index--) {
    const other = randomInt(index + 1)
    ;[characters[index], characters[other]] = [characters[other], characters[index]]
  }
  return characters.join('')
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write(help)
    return
  }
  const { operation, identifier, name } = parseArgs(args)
  if (['CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'TF_BUILD', 'BUILD_BUILDID', 'JENKINS_URL', 'TEAMCITY_VERSION'].some(key => process.env[key])) {
    throw new LocalAdminError('Account administration is local-only and must not run in CI.')
  }
  const projectUrl = process.env.SUPABASE_URL?.trim() || await prompt('Supabase project URL: ')
  const secret = process.env.SUPABASE_SECRET_KEY?.trim() || await prompt('Admin secret (hidden): ', true)
  const url = validateConnection(projectUrl, secret)
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const password = ['create', 'reset'].includes(operation) ? generatePassword() : undefined
  const result = operation === 'create'
    ? await client.auth.admin.createUser({
      email: identifier, password, email_confirm: true,
      ...(name ? { user_metadata: { display_name: name } } : {}),
    })
    : await client.auth.admin.updateUserById(identifier,
      operation === 'reset' ? { password } : { ban_duration: operation === 'ban' ? '876000h' : 'none' })
  if (result.error || !result.data?.user?.id) {
    const status = Number.isInteger(result.error?.status) ? ` (HTTP ${result.error.status})` : ''
    throw new LocalAdminError(`Account operation failed${status}. Check the project, UUID, permissions and Auth settings locally. No credential was printed.`)
  }
  process.stdout.write(`${operation} succeeded. Account UUID: ${result.data.user.id}\n`)
  if (password) {
    process.stdout.write(`Email identifier: ${operation === 'create' ? identifier : result.data.user.email ?? '(consult your account mapping)'}\nGenerated password: ${password}\nDeliver privately; protect terminal scrollback and do not record this output.\n`)
  }
}

main().catch(error => {
  const message = error?.name === 'AbortError' ? 'Cancelled.' : error?.message
  const safe = error instanceof LocalAdminError || error?.name === 'AbortError'
  process.stderr.write(`${safe ? message : 'Account operation failed; no credentials printed. Check connectivity and configuration locally.'}\n`)
  process.exitCode = 1
})