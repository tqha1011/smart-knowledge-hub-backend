import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { SearchDocumentQueryDto } from './document.request.dto';

describe('SearchDocumentQueryDto', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const parse = (value: unknown): Promise<SearchDocumentQueryDto> =>
    pipe.transform(value, { type: 'query', metatype: SearchDocumentQueryDto });

  it.each([undefined, null, '', '   ', 42, ['Guide'], { name: 'Guide' }])(
    'rejects missing, empty or non-string documentName: %p',
    async (documentName) => {
      await expect(parse({ documentName })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('trims the name and supplies pagination defaults', async () => {
    await expect(
      parse({ documentName: '  Employee handbook \n' }),
    ).resolves.toEqual({
      documentName: 'Employee handbook',
      pageNumber: 1,
      pageSize: 20,
    });
  });

  it('converts valid pagination strings to integers', async () => {
    await expect(
      parse({ documentName: 'Guide', pageNumber: '2', pageSize: '5' }),
    ).resolves.toEqual({ documentName: 'Guide', pageNumber: 2, pageSize: 5 });
  });

  it.each(['pageNumber', 'pageSize'])('rejects invalid %s', async (field) => {
    for (const value of ['0', '-1', '1.5', 'abc', '']) {
      await expect(
        parse({ documentName: 'Guide', [field]: value }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
