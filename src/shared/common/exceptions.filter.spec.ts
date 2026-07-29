import {
  ArgumentsHost,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AppError, ErrorCode } from './errorCode';
import { AllExceptionsFilter } from './exceptions.filter';

function createHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', url: '/api/auth/register' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    // The filter logs every exception it handles; silence it so a passing
    // run does not print stack traces.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter = new AllExceptionsFilter();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('gives an AppError the status its ErrorCode implies', () => {
    const { host, status, json } = createHost();

    filter.catch(
      new AppError(ErrorCode.Conflict, 'Email is already registered'),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        message: 'Email is already registered',
        path: '/api/auth/register',
      }),
    );
  });

  it('maps an Unauthorized AppError to 401', () => {
    const { host, status } = createHost();

    filter.catch(
      new AppError(ErrorCode.Unauthorized, 'Email or password is incorrect'),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
  });

  it('leaves a plain HttpException alone', () => {
    const { host, status, json } = createHost();

    filter.catch(new NotFoundException('User not found'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'User not found' }),
    );
  });

  it('reports an unrecognised error as 500 without leaking its message', () => {
    const { host, status, json } = createHost();

    filter.catch(new Error('connect ECONNREFUSED 10.0.0.5:5432'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Internal Server Error' }),
    );
  });
});
