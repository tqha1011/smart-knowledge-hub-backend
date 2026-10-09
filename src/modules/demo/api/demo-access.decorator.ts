import { SetMetadata } from '@nestjs/common';
export type DemoScope = 'space' | 'chat' | 'self' | 'session';
export const DEMO_ACCESS = 'demo:access';
export const AllowDemo = (scope: DemoScope) => SetMetadata(DEMO_ACCESS, scope);
