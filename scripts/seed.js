// Loads demo data: npm run seed
import { openDatabase } from '../src/db.js';
import { createInventory } from '../src/inventory.js';

const inv = createInventory(openDatabase());
if (inv.listItems().length) {
  console.log('Database already has items; skipping seed.');
  process.exit(0);
}

[
  { sku: 'PLY-18', name: 'Plywood 18mm 2400x1200', unit: 'sheet', category: 'Timber', reorder_level: 10 },
  { sku: 'GYP-13', name: 'Plasterboard 13mm', unit: 'sheet', category: 'Linings', reorder_level: 20 },
  { sku: 'SCR-8G', name: 'Screws 8g x 50mm (box 500)', unit: 'box', category: 'Fixings', reorder_level: 5, barcode: '9300000000017' },
  { sku: 'PVC-50', name: 'PVC pipe 50mm x 6m', unit: 'length', category: 'Plumbing', reorder_level: 8 },
  { sku: 'CBL-2.5', name: 'TPS cable 2.5mm (100m)', unit: 'roll', category: 'Electrical', reorder_level: 3 },
  { sku: 'TILE-WW', name: 'Wall tile white 300x600', unit: 'box', category: 'Tiling', reorder_level: 15 },
].forEach((i) => inv.createItemTx(i));

inv.addInstaller({ name: 'Sam Carter', company: 'Carter Carpentry', phone: '0400 111 222' });
inv.addInstaller({ name: 'Priya Nair', company: 'Nair Electrical', phone: '0400 333 444' });
inv.addInstaller({ name: 'Leo Martins', company: 'Martins Plumbing', phone: '0400 555 666' });
inv.addProject({ code: 'BH-001', name: 'Oak Street Townhouses', address: '12 Oak St' });
inv.addProject({ code: 'BH-002', name: 'Riverside Duplex', address: '4 River Rd' });

inv.receiveDelivery({
  supplier: 'Timber & Board Supplies', external_ref: 'DN-10021', recorded_by: 'Site store',
  lines: [{ sku: 'PLY-18', qty: 40 }, { sku: 'GYP-13', qty: 60 }, { sku: 'SCR-8G', qty: 12 }],
});
inv.receiveDelivery({
  supplier: 'Sparky Wholesale', external_ref: 'INV-5531', recorded_by: 'Site store',
  lines: [{ sku: 'CBL-2.5', qty: 6 }, { sku: 'PVC-50', qty: 10 }],
});
inv.issueToInstaller({ installer: 'Sam Carter', project: 'BH-001', recorded_by: 'Site store', lines: [{ sku: 'PLY-18', qty: 12 }, { sku: 'SCR-8G', qty: 3 }] });
inv.issueToInstaller({ installer: 'Priya Nair', project: 'BH-001', recorded_by: 'Site store', lines: [{ sku: 'CBL-2.5', qty: 4 }] });
inv.returnFromInstaller({ installer: 'Sam Carter', project: 'BH-001', recorded_by: 'Site store', lines: [{ sku: 'SCR-8G', qty: 1 }] });
console.log('Seeded demo data.');
