import { DashboardQuerySchema } from './dashboard.dto';

describe('DashboardQuerySchema', () => {
  it('accepts a valid inclusive period', () => {
    const parsed = DashboardQuerySchema.parse({
      startDate: '2026-10-01',
      endDate: '2026-10-01',
    });
    expect(parsed.startDate).toEqual(new Date('2026-10-01T00:00:00.000Z'));
  });

  it.each([
    { startDate: '2026-02-30', endDate: '2026-03-01' },
    { startDate: '2026-10-02', endDate: '2026-10-01' },
  ])('rejects an invalid period: %p', (period) => {
    expect(DashboardQuerySchema.safeParse(period).success).toBe(false);
  });
});
