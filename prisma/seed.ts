import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { PrismaClient } from '../generated/prisma/client';
import {
  DocumentStatus,
  DocumentVisibility,
  FileType,
  PermissionType,
  Role,
  WorkSpaceRole,
} from '../generated/prisma/enums';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}
const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString })),
});

const SEED_PASSWORD = 'Password123!';

/** Fixed publicIds so the seed can be re-run (upsert) without creating duplicates. */
const ids = {
  users: {
    admin: '10000000-0000-4000-8000-000000000001',
    alice: '10000000-0000-4000-8000-000000000002',
    bob: '10000000-0000-4000-8000-000000000003',
  },
  types: {
    handbook: '20000000-0000-4000-8000-000000000001',
    policy: '20000000-0000-4000-8000-000000000002',
    engineering: '20000000-0000-4000-8000-000000000003',
  },
  spaces: {
    engineeringHandbook: '30000000-0000-4000-8000-000000000001',
    hrPolicies: '30000000-0000-4000-8000-000000000002',
  },
  workspaces: {
    adminOwnsEngineering: '40000000-0000-4000-8000-000000000001',
    adminOwnsHr: '40000000-0000-4000-8000-000000000002',
    aliceEditsEngineering: '40000000-0000-4000-8000-000000000003',
    aliceViewsHr: '40000000-0000-4000-8000-000000000004',
    bobViewsEngineering: '40000000-0000-4000-8000-000000000005',
  },
  categories: {
    onboarding: '50000000-0000-4000-8000-000000000001',
    architecture: '50000000-0000-4000-8000-000000000002',
    leavePolicy: '50000000-0000-4000-8000-000000000003',
    codeOfConduct: '50000000-0000-4000-8000-000000000004',
  },
  documents: {
    gettingStarted: '60000000-0000-4000-8000-000000000001',
    systemArchitecture: '60000000-0000-4000-8000-000000000002',
    annualLeave: '60000000-0000-4000-8000-000000000003',
    codeOfConduct: '60000000-0000-4000-8000-000000000004',
  },
};

async function seedUsers() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { publicId: ids.users.admin },
    update: {},
    create: {
      publicId: ids.users.admin,
      username: 'admin',
      email: 'admin@example.com',
      password: passwordHash,
      role: Role.Admin,
    },
  });

  const alice = await prisma.user.upsert({
    where: { publicId: ids.users.alice },
    update: {},
    create: {
      publicId: ids.users.alice,
      username: 'alice',
      email: 'alice@example.com',
      password: passwordHash,
      role: Role.Employee,
    },
  });

  const bob = await prisma.user.upsert({
    where: { publicId: ids.users.bob },
    update: {},
    create: {
      publicId: ids.users.bob,
      username: 'bob',
      email: 'bob@example.com',
      password: passwordHash,
      role: Role.Employee,
    },
  });

  return { admin, alice, bob };
}

async function seedKnowledgeSpaceTypes() {
  const handbook = await prisma.knowledgeSpaceType.upsert({
    where: { publicId: ids.types.handbook },
    update: {},
    create: { publicId: ids.types.handbook, name: 'Handbook' },
  });

  const policy = await prisma.knowledgeSpaceType.upsert({
    where: { publicId: ids.types.policy },
    update: {},
    create: { publicId: ids.types.policy, name: 'Policy' },
  });

  const engineering = await prisma.knowledgeSpaceType.upsert({
    where: { publicId: ids.types.engineering },
    update: {},
    create: { publicId: ids.types.engineering, name: 'Engineering' },
  });

  return { handbook, policy, engineering };
}

async function seedKnowledgeSpaces(typeIds: {
  engineeringTypeId: number;
  policyTypeId: number;
}) {
  const engineeringHandbook = await prisma.knowledgeSpace.upsert({
    where: { publicId: ids.spaces.engineeringHandbook },
    update: {},
    create: {
      publicId: ids.spaces.engineeringHandbook,
      name: 'Engineering Handbook',
      description: 'Everything a new engineer needs to get started',
      typeId: typeIds.engineeringTypeId,
    },
  });

  const hrPolicies = await prisma.knowledgeSpace.upsert({
    where: { publicId: ids.spaces.hrPolicies },
    update: {},
    create: {
      publicId: ids.spaces.hrPolicies,
      name: 'HR Policies',
      description: 'Company-wide HR policies and guidelines',
      typeId: typeIds.policyTypeId,
    },
  });

  return { engineeringHandbook, hrPolicies };
}

async function seedMemberships(userIds: {
  adminId: number;
  aliceId: number;
  bobId: number;
}) {
  const memberships: {
    publicId: string;
    userId: number;
    knowledgeSpaceId: number;
    role: WorkSpaceRole;
  }[] = [];

  const engineeringHandbookId = (
    await prisma.knowledgeSpace.findUniqueOrThrow({
      where: { publicId: ids.spaces.engineeringHandbook },
      select: { id: true },
    })
  ).id;
  const hrPoliciesId = (
    await prisma.knowledgeSpace.findUniqueOrThrow({
      where: { publicId: ids.spaces.hrPolicies },
      select: { id: true },
    })
  ).id;

  memberships.push(
    {
      publicId: ids.workspaces.adminOwnsEngineering,
      userId: userIds.adminId,
      knowledgeSpaceId: engineeringHandbookId,
      role: WorkSpaceRole.Owner,
    },
    {
      publicId: ids.workspaces.adminOwnsHr,
      userId: userIds.adminId,
      knowledgeSpaceId: hrPoliciesId,
      role: WorkSpaceRole.Owner,
    },
    {
      publicId: ids.workspaces.aliceEditsEngineering,
      userId: userIds.aliceId,
      knowledgeSpaceId: engineeringHandbookId,
      role: WorkSpaceRole.Editor,
    },
    {
      publicId: ids.workspaces.aliceViewsHr,
      userId: userIds.aliceId,
      knowledgeSpaceId: hrPoliciesId,
      role: WorkSpaceRole.Viewer,
    },
    {
      publicId: ids.workspaces.bobViewsEngineering,
      userId: userIds.bobId,
      knowledgeSpaceId: engineeringHandbookId,
      role: WorkSpaceRole.Viewer,
    },
  );

  for (const membership of memberships) {
    await prisma.userWorkspace.upsert({
      where: { publicId: membership.publicId },
      update: {},
      create: membership,
    });
  }

  return { engineeringHandbookId, hrPoliciesId };
}

async function seedCategories(spaceIds: {
  engineeringHandbookId: number;
  hrPoliciesId: number;
}) {
  const onboarding = await prisma.category.upsert({
    where: { publicId: ids.categories.onboarding },
    update: {},
    create: {
      publicId: ids.categories.onboarding,
      name: 'Onboarding',
      knowledgeSpaceId: spaceIds.engineeringHandbookId,
    },
  });

  const architecture = await prisma.category.upsert({
    where: { publicId: ids.categories.architecture },
    update: {},
    create: {
      publicId: ids.categories.architecture,
      name: 'Architecture',
      knowledgeSpaceId: spaceIds.engineeringHandbookId,
    },
  });

  const leavePolicy = await prisma.category.upsert({
    where: { publicId: ids.categories.leavePolicy },
    update: {},
    create: {
      publicId: ids.categories.leavePolicy,
      name: 'Leave Policy',
      knowledgeSpaceId: spaceIds.hrPoliciesId,
    },
  });

  const codeOfConduct = await prisma.category.upsert({
    where: { publicId: ids.categories.codeOfConduct },
    update: {},
    create: {
      publicId: ids.categories.codeOfConduct,
      name: 'Code of Conduct',
      knowledgeSpaceId: spaceIds.hrPoliciesId,
    },
  });

  return { onboarding, architecture, leavePolicy, codeOfConduct };
}

async function seedDocuments(context: {
  engineeringHandbookId: number;
  hrPoliciesId: number;
  onboardingId: number;
  architectureId: number;
  leavePolicyId: number;
  codeOfConductId: number;
  adminId: number;
}) {
  const gettingStarted = await prisma.document.upsert({
    where: { publicId: ids.documents.gettingStarted },
    update: {},
    create: {
      publicId: ids.documents.gettingStarted,
      title: 'Getting Started Guide',
      description: 'What every new engineer should read on day one',
      content:
        'Welcome to the team! This guide walks through setting up your dev environment, ' +
        'requesting access, and shipping your first pull request.',
      status: DocumentStatus.Ready,
      storagePath: `documents/${ids.spaces.engineeringHandbook}/seed-getting-started.md`,
      fileType: FileType.MD,
      fileSize: 512,
      visibility: DocumentVisibility.Public,
      knowledgeSpaceId: context.engineeringHandbookId,
      authorId: context.adminId,
      categoryId: context.onboardingId,
    },
  });

  const systemArchitecture = await prisma.document.upsert({
    where: { publicId: ids.documents.systemArchitecture },
    update: {},
    create: {
      publicId: ids.documents.systemArchitecture,
      title: 'System Architecture Overview',
      description: 'Internal-only breakdown of the service architecture',
      content:
        'This document covers the service boundaries, data flow between the API, the ' +
        'ingestion queue, and the vector store. Restricted to engineering staff.',
      status: DocumentStatus.Ready,
      storagePath: `documents/${ids.spaces.engineeringHandbook}/seed-system-architecture.md`,
      fileType: FileType.MD,
      fileSize: 512,
      visibility: DocumentVisibility.Restricted,
      knowledgeSpaceId: context.engineeringHandbookId,
      authorId: context.adminId,
      categoryId: context.architectureId,
    },
  });

  const annualLeave = await prisma.document.upsert({
    where: { publicId: ids.documents.annualLeave },
    update: {},
    create: {
      publicId: ids.documents.annualLeave,
      title: 'Annual Leave Policy',
      description: 'How annual leave accrues and how to request time off',
      content:
        'Full-time employees accrue 12 days of annual leave per year. Submit requests ' +
        'through the HR portal at least 5 business days in advance.',
      status: DocumentStatus.Ready,
      storagePath: `documents/${ids.spaces.hrPolicies}/seed-annual-leave.md`,
      fileType: FileType.MD,
      fileSize: 512,
      visibility: DocumentVisibility.Public,
      knowledgeSpaceId: context.hrPoliciesId,
      authorId: context.adminId,
      categoryId: context.leavePolicyId,
    },
  });

  const codeOfConductDoc = await prisma.document.upsert({
    where: { publicId: ids.documents.codeOfConduct },
    update: {},
    create: {
      publicId: ids.documents.codeOfConduct,
      title: 'Code of Conduct',
      description: 'Expected standards of behavior for all employees',
      content:
        'We are committed to a respectful and inclusive workplace. This document covers ' +
        'expected conduct, reporting channels, and enforcement.',
      status: DocumentStatus.Ready,
      storagePath: `documents/${ids.spaces.hrPolicies}/seed-code-of-conduct.md`,
      fileType: FileType.MD,
      fileSize: 512,
      visibility: DocumentVisibility.Public,
      knowledgeSpaceId: context.hrPoliciesId,
      authorId: context.adminId,
      categoryId: context.codeOfConductId,
    },
  });

  return { gettingStarted, systemArchitecture, annualLeave, codeOfConductDoc };
}

async function seedDocumentPermissions(documentId: number, userId: number) {
  await prisma.documentPermission.upsert({
    where: {
      unique_document_permission_per_user: { documentId, userId },
    },
    update: {},
    create: {
      documentId,
      userId,
      permission: PermissionType.Read,
    },
  });
}

async function main() {
  const { admin, alice, bob } = await seedUsers();
  const types = await seedKnowledgeSpaceTypes();
  await seedKnowledgeSpaces({
    engineeringTypeId: types.engineering.id,
    policyTypeId: types.policy.id,
  });
  const { engineeringHandbookId, hrPoliciesId } = await seedMemberships({
    adminId: admin.id,
    aliceId: alice.id,
    bobId: bob.id,
  });
  const categories = await seedCategories({
    engineeringHandbookId,
    hrPoliciesId,
  });
  const documents = await seedDocuments({
    engineeringHandbookId,
    hrPoliciesId,
    onboardingId: categories.onboarding.id,
    architectureId: categories.architecture.id,
    leavePolicyId: categories.leavePolicy.id,
    codeOfConductId: categories.codeOfConduct.id,
    adminId: admin.id,
  });
  // Restricted doc: grant bob read access so the permission flow is exercisable too.
  await seedDocumentPermissions(documents.systemArchitecture.id, bob.id);

  console.log('Seed data ready. All seed users share the password:', SEED_PASSWORD);
  console.log('  admin@example.com (Admin)');
  console.log('  alice@example.com (Employee)');
  console.log('  bob@example.com   (Employee)');
}

main()
  .catch((error: unknown) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
