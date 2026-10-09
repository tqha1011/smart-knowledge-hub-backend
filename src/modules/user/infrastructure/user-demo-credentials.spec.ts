import { ConfigService } from '@nestjs/config';
import { UserRepository } from './user.repo';

it('excludes guest identities when fetching password credentials', async () => {
  const findUnique = jest.fn().mockResolvedValue(null);
  const repository = new UserRepository(
    { user: { findUnique } } as never,
    new ConfigService(),
  );
  await repository.getUserPasswordAsync('guest-id');
  expect(findUnique).toHaveBeenCalledWith({
    where: { publicId: 'guest-id', demoSession: null },
    select: { id: true, password: true },
  });
});
