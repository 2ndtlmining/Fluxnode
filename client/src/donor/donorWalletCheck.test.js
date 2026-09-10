import { checkDonorWallet, CHECK_STATUS } from './donorWalletCheck';
import { validateAddress } from 'apidata';
import { fetch_donor_status } from './donorStatus';

jest.mock('apidata', () => ({ validateAddress: jest.fn() }));
jest.mock('./donorStatus', () => ({ fetch_donor_status: jest.fn() }));

describe('checkDonorWallet', () => {
  beforeEach(() => {
    validateAddress.mockReset();
    fetch_donor_status.mockReset();
  });

  it('returns INVALID without calling fetch_donor_status when the address fails validation', async () => {
    validateAddress.mockResolvedValue(false);
    const { status, result } = await checkDonorWallet('not-a-real-address');
    expect(status).toBe(CHECK_STATUS.INVALID);
    expect(result).toBeNull();
    expect(fetch_donor_status).not.toHaveBeenCalled();
  });

  it('returns SUCCESS with the real result when the wallet qualifies', async () => {
    validateAddress.mockResolvedValue(true);
    const donorResult = { isDonor: true, totalInWindow: 25, expiresAt: 123, daysLeft: 10, verified: true };
    fetch_donor_status.mockResolvedValue(donorResult);
    const { status, result } = await checkDonorWallet('t1RealAddress');
    expect(status).toBe(CHECK_STATUS.SUCCESS);
    expect(result).toBe(donorResult);
  });

  it('returns FAILURE when verified but below threshold', async () => {
    validateAddress.mockResolvedValue(true);
    const donorResult = { isDonor: false, totalInWindow: 2, expiresAt: null, daysLeft: 0, verified: true };
    fetch_donor_status.mockResolvedValue(donorResult);
    const { status, result } = await checkDonorWallet('t1RealAddress');
    expect(status).toBe(CHECK_STATUS.FAILURE);
    expect(result).toBe(donorResult);
  });

  it('returns UNVERIFIED when the scan could not complete and did not qualify', async () => {
    validateAddress.mockResolvedValue(true);
    const donorResult = { isDonor: false, totalInWindow: 0, expiresAt: null, daysLeft: 0, verified: false };
    fetch_donor_status.mockResolvedValue(donorResult);
    const { status, result } = await checkDonorWallet('t1RealAddress');
    expect(status).toBe(CHECK_STATUS.UNVERIFIED);
    expect(result).toBe(donorResult);
  });

  it('trims whitespace before validating', async () => {
    validateAddress.mockResolvedValue(true);
    fetch_donor_status.mockResolvedValue({ isDonor: true, totalInWindow: 25, expiresAt: 1, daysLeft: 1, verified: true });
    await checkDonorWallet('  t1RealAddress  ');
    expect(validateAddress).toHaveBeenCalledWith('t1RealAddress');
  });
});
