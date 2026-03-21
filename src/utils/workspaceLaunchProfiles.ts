import type { LaunchProfile } from '../types/electron';

function parseStep(token: string, index: number) {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }

  const delayMatch = trimmed.match(/^(\d+)\s*>\s*(.+)$/);
  if (!delayMatch) {
    return {
      command: trimmed,
      delayMs: index === 0 ? 0 : 400
    };
  }

  return {
    command: delayMatch[2].trim(),
    delayMs: Number(delayMatch[1])
  };
}

export function parseLaunchProfiles(input: string): LaunchProfile[] {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const separatorIndex = line.indexOf('|');
      if (separatorIndex === -1) {
        const steps = line
          .split(':::')
          .map(parseStep)
          .filter((step): step is NonNullable<ReturnType<typeof parseStep>> => step !== null);

        return {
          id: `launch-profile-${index + 1}`,
          name: `Profile ${index + 1}`,
          steps
        };
      }

      const name = line.slice(0, separatorIndex).trim() || `Profile ${index + 1}`;
      const steps = line
        .slice(separatorIndex + 1)
        .split(':::')
        .map(parseStep)
        .filter((step): step is NonNullable<ReturnType<typeof parseStep>> => step !== null);

      return {
        id: `launch-profile-${index + 1}`,
        name,
        steps
      };
    })
    .filter((profile) => profile.steps.length > 0);
}

export function formatLaunchProfiles(profiles: LaunchProfile[]): string {
  return profiles
    .map((profile) => `${profile.name} | ${profile.steps.map((step) => `${step.delayMs}>${step.command}`).join(' ::: ')}`)
    .join('\n');
}
