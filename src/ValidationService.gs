/**
 * ValidationService.gs
 * Validasi yang dipakai berulang di banyak Service — satu tempat, tidak
 * diduplikasi (prinsip yang sama dengan CalculationService: satu sumber
 * kebenaran per aturan).
 */

function requireMemberExists(memberId) {
  const member = findRecordById(SHEET_NAMES.ANGGOTA, 'member_id', memberId);
  if (!member) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Anggota tidak ditemukan: ' + memberId);
  }
  return member;
}

function requireMemberActive(memberId) {
  const member = requireMemberExists(memberId);
  if (member.status !== ANGGOTA_STATUS.AKTIF) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Anggota berstatus tidak aktif: ' + memberId);
  }
  return member;
}

function requirePositiveAmount(value, label) {
  const n = toPositiveNumber(value);
  if (n === null || n <= 0) {
    throw new AppError(ERROR_CODES.INVALID_AMOUNT, (label || 'Nominal') + ' harus lebih dari 0.');
  }
  return n;
}
