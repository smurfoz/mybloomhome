type Tone = 'slate' | 'blue' | 'amber' | 'green' | 'red' | 'purple' | 'navy';

export function companyStatusTone(status: string): Tone {
  return { LEAD: 'slate', PROSPECT: 'blue', CLIENT: 'green', INACTIVE: 'red' }[status] as Tone ?? 'slate';
}

export function dealStageTone(stage: string): Tone {
  return (
    ({
      LEAD: 'slate',
      QUALIFIED: 'blue',
      PROPOSAL: 'purple',
      NEGOTIATION: 'amber',
      WON: 'green',
      LOST: 'red',
    }[stage] as Tone) ?? 'slate'
  );
}

export function projectStatusTone(status: string): Tone {
  return (
    ({
      PLANNING: 'slate',
      ACTIVE: 'blue',
      ON_HOLD: 'amber',
      COMPLETED: 'green',
    }[status] as Tone) ?? 'slate'
  );
}

export function inspectionStatusTone(status: string): Tone {
  return (
    ({
      SCHEDULED: 'slate',
      PASSED: 'green',
      FAILED: 'red',
      NEEDS_REWORK: 'amber',
    }[status] as Tone) ?? 'slate'
  );
}

export function taskStatusTone(status: string): Tone {
  return (
    ({
      OPEN: 'slate',
      IN_PROGRESS: 'blue',
      DONE: 'green',
    }[status] as Tone) ?? 'slate'
  );
}

export function taskPriorityTone(priority: string): Tone {
  return (
    ({
      LOW: 'slate',
      MEDIUM: 'blue',
      HIGH: 'red',
    }[priority] as Tone) ?? 'slate'
  );
}
