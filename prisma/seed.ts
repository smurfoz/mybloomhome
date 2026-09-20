import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

async function main() {
  console.log('Seeding Olumba Quality CRM...');

  await prisma.activity.deleteMany();
  await prisma.document.deleteMany();
  await prisma.task.deleteMany();
  await prisma.inspection.deleteMany();
  await prisma.project.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('olumba2026', 10);

  const admin = await prisma.user.create({
    data: { name: 'Dara Okafor', email: 'admin@olumbaquality.com', password: passwordHash, role: 'ADMIN' },
  });
  const sales = await prisma.user.create({
    data: { name: 'Priya Nandan', email: 'priya@olumbaquality.com', password: passwordHash, role: 'SALES' },
  });
  const inspector = await prisma.user.create({
    data: { name: 'Marcus Webb', email: 'marcus@olumbaquality.com', password: passwordHash, role: 'INSPECTOR' },
  });

  const companiesData = [
    { name: 'Brightline Builders', type: 'GENERAL_CONTRACTOR', status: 'CLIENT', city: 'Austin', state: 'TX' },
    { name: 'Northgate Construction Group', type: 'GENERAL_CONTRACTOR', status: 'CLIENT', city: 'Denver', state: 'CO' },
    { name: 'Fieldstone Development Partners', type: 'DEVELOPER', status: 'PROSPECT', city: 'Charlotte', state: 'NC' },
    { name: 'Ironclad Concrete & Framing', type: 'SUBCONTRACTOR', status: 'PROSPECT', city: 'Phoenix', state: 'AZ' },
    { name: 'Summit Ridge Contractors', type: 'GENERAL_CONTRACTOR', status: 'LEAD', city: 'Salt Lake City', state: 'UT' },
    { name: 'Vantage Point Architecture', type: 'ARCHITECT', status: 'LEAD', city: 'Seattle', state: 'WA' },
    { name: 'Harborview Owners Group', type: 'OWNER', status: 'LEAD', city: 'Tampa', state: 'FL' },
    { name: 'Cascade Build Co.', type: 'GENERAL_CONTRACTOR', status: 'INACTIVE', city: 'Portland', state: 'OR' },
  ] as const;

  const companies = [];
  for (const c of companiesData) {
    companies.push(
      await prisma.company.create({
        data: {
          ...c,
          website: `https://www.${c.name.toLowerCase().replace(/[^a-z]+/g, '')}.com`,
          phone: '(555) 010-' + Math.floor(1000 + Math.random() * 8999),
          email: `contact@${c.name.toLowerCase().replace(/[^a-z]+/g, '')}.com`,
        },
      })
    );
  }
  const [brightline, northgate, fieldstone, ironclad, summit, vantage, harborview, cascade] = companies;

  const contactSeed = [
    { c: brightline, firstName: 'Elena', lastName: 'Marsh', title: 'VP of Operations' },
    { c: brightline, firstName: 'Tom', lastName: 'Reyes', title: 'Site Superintendent' },
    { c: northgate, firstName: 'Grace', lastName: 'Lin', title: 'Project Executive' },
    { c: fieldstone, firstName: 'Owen', lastName: 'Bricks', title: 'Director of Development' },
    { c: ironclad, firstName: 'Sam', lastName: 'Patel', title: 'Owner' },
    { c: summit, firstName: 'Nadia', lastName: 'Kowalski', title: 'Preconstruction Manager' },
    { c: vantage, firstName: 'Liam', lastName: 'Osei', title: 'Principal Architect' },
    { c: harborview, firstName: 'Carla', lastName: 'Jimenez', title: 'HOA President' },
  ];
  const contacts = [];
  for (const c of contactSeed) {
    contacts.push(
      await prisma.contact.create({
        data: {
          firstName: c.firstName,
          lastName: c.lastName,
          title: c.title,
          email: `${c.firstName.toLowerCase()}.${c.lastName.toLowerCase()}@example.com`,
          phone: '(555) 020-' + Math.floor(1000 + Math.random() * 8999),
          companyId: c.c.id,
        },
      })
    );
  }

  const dealsSeed = [
    { title: 'Brightline — Riverside Lofts QA Program', company: brightline, contact: contacts[0], stage: 'WON', value: 84000, probability: 100, owner: sales },
    { title: 'Northgate — Cedar Point Tower Inspections', company: northgate, contact: contacts[2], stage: 'WON', value: 132000, probability: 100, owner: sales },
    { title: 'Fieldstone — Maple Yards Phase 1 QA', company: fieldstone, contact: contacts[3], stage: 'NEGOTIATION', value: 96000, probability: 70, owner: sales },
    { title: 'Ironclad — Framing Punch List Audits', company: ironclad, contact: contacts[4], stage: 'PROPOSAL', value: 28000, probability: 50, owner: sales },
    { title: 'Summit Ridge — Alpine Business Park QA', company: summit, contact: contacts[5], stage: 'QUALIFIED', value: 61000, probability: 30, owner: admin },
    { title: 'Vantage Point — Design-Assist Inspections', company: vantage, contact: contacts[6], stage: 'LEAD', value: 18000, probability: 15, owner: admin },
    { title: 'Harborview — Condo Remediation Documentation', company: harborview, contact: contacts[7], stage: 'LEAD', value: 42000, probability: 15, owner: sales },
    { title: 'Cascade Build — Legacy Punch List Cleanup', company: cascade, contact: null, stage: 'LOST', value: 15000, probability: 0, owner: admin, lostReason: 'Went with in-house QA team' },
  ] as const;

  const deals = [];
  for (const d of dealsSeed) {
    deals.push(
      await prisma.deal.create({
        data: {
          title: d.title,
          companyId: d.company.id,
          contactId: d.contact?.id ?? null,
          stage: d.stage,
          value: d.value,
          probability: d.probability,
          ownerId: d.owner.id,
          expectedClose: d.stage === 'WON' || d.stage === 'LOST' ? daysFromNow(-14) : daysFromNow(21),
          lostReason: 'lostReason' in d ? d.lostReason : null,
        },
      })
    );
  }
  const [wonBrightline, wonNorthgate] = deals;

  const projectsSeed = [
    {
      name: 'Riverside Lofts',
      company: brightline,
      deal: wonBrightline,
      type: 'RESIDENTIAL',
      status: 'ACTIVE',
      address: '480 Riverside Dr, Austin, TX',
      budget: 4200000,
      costSaved: 61500,
      startDate: daysFromNow(-90),
      endDate: daysFromNow(120),
    },
    {
      name: 'Cedar Point Tower',
      company: northgate,
      deal: wonNorthgate,
      type: 'COMMERCIAL',
      status: 'ACTIVE',
      address: '1200 Cedar Point Blvd, Denver, CO',
      budget: 9800000,
      costSaved: 138200,
      startDate: daysFromNow(-150),
      endDate: daysFromNow(200),
    },
    {
      name: 'Willow Creek Apartments',
      company: brightline,
      deal: null,
      type: 'RESIDENTIAL',
      status: 'COMPLETED',
      address: '22 Willow Creek Ln, Austin, TX',
      budget: 2100000,
      costSaved: 34800,
      startDate: daysFromNow(-400),
      endDate: daysFromNow(-30),
    },
    {
      name: 'Northgate Distribution Center',
      company: northgate,
      deal: null,
      type: 'INDUSTRIAL',
      status: 'PLANNING',
      address: '900 Freight Way, Aurora, CO',
      budget: 15600000,
      costSaved: 0,
      startDate: daysFromNow(30),
      endDate: daysFromNow(430),
    },
  ] as const;

  const projects = [];
  for (const p of projectsSeed) {
    projects.push(
      await prisma.project.create({
        data: {
          name: p.name,
          companyId: p.company.id,
          dealId: p.deal?.id ?? null,
          type: p.type,
          status: p.status,
          address: p.address,
          budget: p.budget,
          costSaved: p.costSaved,
          startDate: p.startDate,
          endDate: p.endDate,
        },
      })
    );
  }
  const [riverside, cedarPoint, willowCreek, distCenter] = projects;

  const inspectionsSeed = [
    { project: riverside, title: 'Foundation Rebar Placement', trade: 'FOUNDATION', status: 'PASSED', defectsFound: 1, costImpact: 800, scheduledDate: daysFromNow(-80), completedDate: daysFromNow(-79) },
    { project: riverside, title: 'Framing — Building B, Floors 3-5', trade: 'FRAMING', status: 'NEEDS_REWORK', defectsFound: 7, costImpact: 9200, scheduledDate: daysFromNow(-20), completedDate: daysFromNow(-19) },
    { project: riverside, title: 'Rough Electrical Walkthrough', trade: 'ELECTRICAL', status: 'FAILED', defectsFound: 12, costImpact: 15400, scheduledDate: daysFromNow(-10), completedDate: daysFromNow(-9) },
    { project: riverside, title: 'Plumbing Rough-In', trade: 'PLUMBING', status: 'SCHEDULED', defectsFound: 0, costImpact: 0, scheduledDate: daysFromNow(4), completedDate: null },
    { project: cedarPoint, title: 'Curtain Wall Waterproofing', trade: 'SITEWORK', status: 'PASSED', defectsFound: 2, costImpact: 2100, scheduledDate: daysFromNow(-60), completedDate: daysFromNow(-59) },
    { project: cedarPoint, title: 'HVAC Ductwork — Floors 8-12', trade: 'HVAC', status: 'NEEDS_REWORK', defectsFound: 5, costImpact: 18800, scheduledDate: daysFromNow(-15), completedDate: daysFromNow(-14) },
    { project: cedarPoint, title: 'Fire Suppression Rough-In', trade: 'FIRE_SAFETY', status: 'PASSED', defectsFound: 1, costImpact: 600, scheduledDate: daysFromNow(-5), completedDate: daysFromNow(-4) },
    { project: cedarPoint, title: 'Drywall & Fireproofing Check', trade: 'DRYWALL', status: 'SCHEDULED', defectsFound: 0, costImpact: 0, scheduledDate: daysFromNow(6), completedDate: null },
    { project: willowCreek, title: 'Final Punch List Walkthrough', trade: 'FINISHES', status: 'PASSED', defectsFound: 3, costImpact: 1400, scheduledDate: daysFromNow(-35), completedDate: daysFromNow(-34) },
    { project: distCenter, title: 'Sitework Grading Pre-Check', trade: 'SITEWORK', status: 'SCHEDULED', defectsFound: 0, costImpact: 0, scheduledDate: daysFromNow(35), completedDate: null },
  ] as const;

  const inspections = [];
  for (const i of inspectionsSeed) {
    inspections.push(
      await prisma.inspection.create({
        data: {
          projectId: i.project.id,
          title: i.title,
          trade: i.trade,
          status: i.status,
          defectsFound: i.defectsFound,
          costImpact: i.costImpact,
          scheduledDate: i.scheduledDate,
          completedDate: i.completedDate,
          inspectorId: inspector.id,
          notes:
            i.status === 'FAILED' || i.status === 'NEEDS_REWORK'
              ? 'Documented defects with photo evidence; rework required before re-inspection.'
              : null,
        },
      })
    );
  }

  await prisma.document.createMany({
    data: [
      { name: 'Riverside_Framing_Defects.pdf', type: 'REPORT', fileUrl: '#', projectId: riverside.id, inspectionId: inspections[1].id },
      { name: 'Riverside_Electrical_PunchList.pdf', type: 'PUNCH_LIST', fileUrl: '#', projectId: riverside.id, inspectionId: inspections[2].id },
      { name: 'CedarPoint_HVAC_Photos.zip', type: 'PHOTO', fileUrl: '#', projectId: cedarPoint.id, inspectionId: inspections[5].id },
      { name: 'CedarPoint_Fire_Suppression_Cert.pdf', type: 'COMPLIANCE_CERT', fileUrl: '#', projectId: cedarPoint.id, inspectionId: inspections[6].id },
      { name: 'Riverside_Building_Permit.pdf', type: 'PERMIT', fileUrl: '#', projectId: riverside.id, inspectionId: null },
    ],
  });

  await prisma.task.createMany({
    data: [
      { title: 'Send revised proposal to Fieldstone', status: 'IN_PROGRESS', priority: 'HIGH', dueDate: daysFromNow(2), assigneeId: sales.id, dealId: deals[2].id },
      { title: 'Follow up on Ironclad pricing questions', status: 'OPEN', priority: 'MEDIUM', dueDate: daysFromNow(3), assigneeId: sales.id, dealId: deals[3].id },
      { title: 'Schedule discovery call with Summit Ridge', status: 'OPEN', priority: 'MEDIUM', dueDate: daysFromNow(5), assigneeId: admin.id, dealId: deals[4].id },
      { title: 'Re-inspect Riverside rough electrical after rework', status: 'OPEN', priority: 'HIGH', dueDate: daysFromNow(6), assigneeId: inspector.id, projectId: riverside.id },
      { title: 'Confirm HVAC rework schedule with Northgate PM', status: 'OPEN', priority: 'HIGH', dueDate: daysFromNow(3), assigneeId: inspector.id, projectId: cedarPoint.id },
      { title: 'Compile Q3 cost-savings report for Brightline', status: 'OPEN', priority: 'LOW', dueDate: daysFromNow(10), assigneeId: admin.id, projectId: riverside.id },
      { title: 'Archive Willow Creek closeout documents', status: 'DONE', priority: 'LOW', dueDate: daysFromNow(-5), assigneeId: admin.id, projectId: willowCreek.id },
    ],
  });

  await prisma.activity.createMany({
    data: [
      { type: 'STAGE_CHANGE', content: 'Deal moved to Won — kickoff scheduled with Brightline.', userId: sales.id, companyId: brightline.id, dealId: wonBrightline.id },
      { type: 'MEETING', content: 'Kickoff call with Grace Lin to align on inspection cadence for Cedar Point.', userId: sales.id, companyId: northgate.id, dealId: wonNorthgate.id },
      { type: 'CALL', content: 'Discussed proposal scope and pricing with Owen Bricks.', userId: sales.id, companyId: fieldstone.id, dealId: deals[2].id },
      { type: 'EMAIL', content: 'Sent revised SOW with expanded punch-list audit coverage.', userId: sales.id, companyId: ironclad.id, dealId: deals[3].id },
      { type: 'NOTE', content: 'Framing rework flagged 7 defects — estimated $9.2k in avoided rework cost if caught post-drywall.', userId: inspector.id, projectId: riverside.id },
      { type: 'NOTE', content: 'HVAC ductwork inspection found misaligned runs on floors 8-12; GC notified same day.', userId: inspector.id, projectId: cedarPoint.id },
      { type: 'SYSTEM', content: 'Project Willow Creek Apartments marked complete.', projectId: willowCreek.id },
    ],
  });

  console.log('Seed complete.');
  console.log('Login: admin@olumbaquality.com / priya@olumbaquality.com / marcus@olumbaquality.com — password: olumba2026');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
