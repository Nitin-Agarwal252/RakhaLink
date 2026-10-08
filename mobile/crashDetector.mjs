export function detectCrashSequence(samples) {
  for (let impactIndex = 0; impactIndex < samples.length; impactIndex += 1) {
    const impact = samples[impactIndex];
    if (!Number.isFinite(impact.impact_g) || impact.impact_g < 3) continue;
    const speedContext = [...samples.slice(0, impactIndex)].reverse().find(sample =>
      Number.isFinite(sample.speed_kmh) && sample.speed_kmh >= 25 && impact.at_ms - sample.at_ms <= 3000
    );
    if (!speedContext) continue;
    const suddenStop = samples.slice(impactIndex + 1).find(sample =>
      Number.isFinite(sample.speed_kmh) && sample.at_ms - impact.at_ms <= 2000 &&
      speedContext.speed_kmh - sample.speed_kmh >= 25 && sample.speed_kmh <= Math.max(10, speedContext.speed_kmh * 0.35)
    );
    if (suddenStop) {
      return {
        peak_g: impact.impact_g,
        pre_impact_kmh: speedContext.speed_kmh,
        impact_at_ms: impact.at_ms,
        stop_at_ms: suddenStop.at_ms,
      };
    }
  }
  return null;
}

export const demoCrashTraces = {
  singleSpike: [
    { at_ms: 0, speed_kmh: 65, impact_g: 0.9 },
    { at_ms: 900, speed_kmh: 64, impact_g: 8.1 },
    { at_ms: 1700, speed_kmh: 63, impact_g: 1.1 },
  ],
  impactAndSuddenStop: [
    { at_ms: 0, speed_kmh: 72, impact_g: 1 },
    { at_ms: 700, speed_kmh: 70, impact_g: 8.4 },
    { at_ms: 1400, speed_kmh: 4, impact_g: 1.2 },
  ],
  impactWithoutSpeedContext: [
    { at_ms: 0, speed_kmh: 0, impact_g: 1 },
    { at_ms: 700, speed_kmh: 0, impact_g: 8.4 },
    { at_ms: 1400, speed_kmh: 0, impact_g: 1.2 },
  ],
};
