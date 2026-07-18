import { Reflector } from '@nestjs/core';
import { SystemRole } from '../domain/enum';

export const Roles = Reflector.createDecorator<SystemRole[]>();
