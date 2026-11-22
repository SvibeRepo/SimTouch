/** applyPhase moved unchanged from TurbulenceField. */
export function phase(field, noise, time) {
    const amplitude = (field.speed > 0 && field.amplitudeEnabled)
      ? field.amplitude * (0.5 + 0.5 * Math.sin(time * field.speed * field.amplitudeSpeed))
      : field.amplitude;
    let phaseOffset;
    if (field.speed > 0 && Math.abs(field.phaseSpeed) > 0) {
      phaseOffset = time * field.speed * Math.abs(field.phaseSpeed) * Math.sign(field.phaseSpeed) + field.phase * Math.PI * 2;
    } else {
      phaseOffset = field.phase * Math.PI * 2;
    }
    return Math.sin(noise * Math.PI * 2 + phaseOffset) * amplitude;
  }
