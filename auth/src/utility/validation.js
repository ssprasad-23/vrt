// Request-body validation for signup/login. Each validator returns an error message string for the
// first problem found, or null if the input is fine — the controller turns a message into a 400.

const USERNAME_PATTERN = /^[A-Za-z0-9_.]{3,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// E.164-ish: a leading +, then 6-15 digits (the app sends `${countryCode}${digits}`)
const PHONE_PATTERN = /^\+\d{6,15}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const PASSWORD_MIN_LENGTH = 8;
// bcrypt only uses the first 72 bytes — anything past that would be silently ignored
const PASSWORD_MAX_BYTES = 72;
// App stores require an age floor for apps with user-generated content
export const MIN_AGE_YEARS = 13;

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const ageInYears = (dob, now = new Date()) => {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const birthdayPassed =
    now.getUTCMonth() > dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() >= dob.getUTCDate());
  if (!birthdayPassed) age -= 1;
  return age;
};

// Phone numbers arrive as e.g. "+1 242 5550000" or "+1-242-555-0000"; store just "+" and digits.
export const normalizePhone = (phone) =>
  typeof phone === 'string' ? phone.replace(/[\s-]/g, '') : phone;

export function validateSignup({ username, email, password, dob, phone_number, country }) {
  if (![username, email, password, dob, country].every(isNonEmptyString)) {
    return 'username, email, password, dob and country are required';
  }
  if (!USERNAME_PATTERN.test(username)) {
    return 'Username must be 3-30 characters: letters, numbers, underscores or dots';
  }
  if (email.length > 255 || !EMAIL_PATTERN.test(email)) {
    return 'Invalid email address';
  }
  const badPassword = validatePassword(password);
  if (badPassword) {
    return badPassword;
  }

  // reject impossible dates like 2001-02-30, which Date would silently roll over
  const birthDate = new Date(`${dob}T00:00:00Z`);
  if (!DATE_PATTERN.test(dob) || Number.isNaN(birthDate.getTime()) || birthDate.toISOString().slice(0, 10) !== dob) {
    return 'Date of birth must be a valid date (YYYY-MM-DD)';
  }
  const age = ageInYears(birthDate);
  if (age < MIN_AGE_YEARS) {
    return `You must be at least ${MIN_AGE_YEARS} years old to sign up`;
  }
  if (age > 120) {
    return 'Date of birth must be a valid date (YYYY-MM-DD)';
  }

  if (phone_number !== undefined && phone_number !== null && phone_number !== '') {
    if (typeof phone_number !== 'string' || !PHONE_PATTERN.test(normalizePhone(phone_number))) {
      return 'Invalid phone number';
    }
  }
  if (country.length > 255) {
    return 'Invalid country';
  }
  return null;
}

export function validateLogin({ username, password }) {
  if (!isNonEmptyString(username) || typeof password !== 'string' || password.length === 0) {
    return 'username and password are required';
  }
  return null;
}

// Shared by signup and password reset so both enforce the same rules
function validatePassword(password) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    return `Password must be at most ${PASSWORD_MAX_BYTES} bytes`;
  }
  return null;
}

const isValidEmail = (email) => isNonEmptyString(email) && email.length <= 255 && EMAIL_PATTERN.test(email.trim());

export function validateForgotPassword({ email }) {
  if (!isValidEmail(email)) {
    return 'A valid email address is required';
  }
  return null;
}

export function validateVerifyResetCode({ email, code }) {
  if (!isValidEmail(email)) {
    return 'A valid email address is required';
  }
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return 'The code must be 6 digits';
  }
  return null;
}

export function validateResetPassword({ resetToken, newPassword }) {
  if (!isNonEmptyString(resetToken) || resetToken.length > 100) {
    return 'resetToken is required';
  }
  if (typeof newPassword !== 'string') {
    return 'newPassword is required';
  }
  return validatePassword(newPassword);
}
