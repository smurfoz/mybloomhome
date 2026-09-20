'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { updateDealStage } from './actions';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

type DealCard = {
  id: string;
  title: string;
  value: number;
  probability: number;
  stage: string;
  company: { name: string };
  owner: { name: string } | null;
};

const STAGES = [
  { key: 'LEAD', label: 'Lead' },
  { key: 'QUALIFIED', label: 'Qualified' },
  { key: 'PROPOSAL', label: 'Proposal' },
  { key: 'NEGOTIATION', label: 'Negotiation' },
  { key: 'WON', label: 'Won' },
  { key: 'LOST', label: 'Lost' },
];

export function KanbanBoard({ deals }: { deals: DealCard[] }) {
  const [items, setItems] = useState(deals);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDrop(stage: string, e: React.DragEvent) {
    e.preventDefault();
    setDragOverStage(null);
    const dealId = e.dataTransfer.getData('text/plain');
    const deal = items.find((d) => d.id === dealId);
    if (!deal || deal.stage === stage) return;

    setItems((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage } : d)));
    startTransition(() => {
      updateDealStage(dealId, stage);
    });
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STAGES.map((stage) => {
        const stageDeals = items.filter((d) => d.stage === stage.key);
        const total = stageDeals.reduce((sum, d) => sum + d.value, 0);
        return (
          <div
            key={stage.key}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStage(stage.key);
            }}
            onDragLeave={() => setDragOverStage(null)}
            onDrop={(e) => handleDrop(stage.key, e)}
            className={cn(
              'flex w-72 shrink-0 flex-col rounded-xl border bg-concrete-50/60 transition',
              dragOverStage === stage.key ? 'border-navy-500 bg-navy-50' : 'border-concrete-200'
            )}
          >
            <div className="flex items-center justify-between border-b border-concrete-200 px-3 py-2.5">
              <span className="text-sm font-semibold text-navy-950">{stage.label}</span>
              <span className="text-xs text-concrete-500">{stageDeals.length}</span>
            </div>
            <div className="px-3 py-1.5 text-xs font-medium text-concrete-500">{formatCurrency(total)}</div>
            <div className="flex-1 space-y-2 p-2">
              {stageDeals.map((deal) => (
                <Link
                  key={deal.id}
                  href={`/deals/${deal.id}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', deal.id);
                  }}
                  className={cn(
                    'block cursor-grab rounded-lg border border-concrete-200 bg-white p-3 shadow-sm transition hover:border-navy-300 hover:shadow active:cursor-grabbing',
                    isPending && 'opacity-70'
                  )}
                >
                  <p className="text-sm font-medium text-navy-950">{deal.title}</p>
                  <p className="mt-0.5 text-xs text-concrete-500">{deal.company.name}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-navy-900">{formatCurrency(deal.value)}</span>
                    <span className="text-xs text-concrete-400">{deal.probability}%</span>
                  </div>
                </Link>
              ))}
              {stageDeals.length === 0 && (
                <p className="px-1 py-3 text-center text-xs text-concrete-400">Drop deals here</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
