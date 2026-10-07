// Release guard. While true, the new screens and the unlock celebration are inactive for everybody unless
// "test mode" was switched on in that browser (five quick taps on the connection indicator in the top bar).
// To release the features to everyone, set this to false (and then remove the guard code, see the README).
export const requireTestMode = true

// Street-style greetings on Home and a varied "Session logged." line (src/lib/greetings.ts). They only appear
// once the new features are visible. Set to false to get the plain "Hey, name." and "Session logged." back.
export const streetGreetings = true
