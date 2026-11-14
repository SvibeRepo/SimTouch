#include "Turbulence.h"

#include <Arduino.h>
#include <math.h>

namespace
{
constexpr float kPi = 3.14159265358979323846f;
constexpr float kTwoPi = 6.28318530717958647692f;
constexpr float kEpsilon = 1e-6f;
constexpr float kCenter = 0.5f;

static const uint8_t kPermBase[256] = {
    151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225,
    140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148,
    247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32,
    57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175,
    74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122,
    60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54,
    65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169,
    200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64,
    52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212,
    207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213,
    119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9,
    129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104,
    218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241,
    81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157,
    184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93,
    222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180};
}

Turbulence::Turbulence(SimConfig *cfg) : config_(cfg)
{
  initPermutation();
}

void Turbulence::initPermutation()
{
  for (uint16_t i = 0; i < 256; ++i)
  {
    perm_[i] = kPermBase[i];
    perm_[i + 256] = kPermBase[i];
  }
}

float Turbulence::fade(float t) const
{
  return t * t * t * (t * (t * 6.0f - 15.0f) + 10.0f);
}

float Turbulence::lerp(float a, float b, float t) const
{
  return a + t * (b - a);
}

float Turbulence::grad(uint8_t hash, float x, float y) const
{
  switch (hash & 7)
  {
  case 0:
    return x + y;
  case 1:
    return -x + y;
  case 2:
    return x - y;
  case 3:
    return -x - y;
  case 4:
    return x;
  case 5:
    return -x;
  case 6:
    return y;
  default:
    return -y;
  }
}

float Turbulence::perlin2d(float x, float y) const
{
  const int xi = ((int)floorf(x)) & 255;
  const int yi = ((int)floorf(y)) & 255;
  const float xf = x - floorf(x);
  const float yf = y - floorf(y);

  const float u = fade(xf);
  const float v = fade(yf);

  const int aa = perm_[perm_[xi] + yi];
  const int ab = perm_[perm_[xi] + yi + 1];
  const int ba = perm_[perm_[xi + 1] + yi];
  const int bb = perm_[perm_[xi + 1] + yi + 1];

  const float x1 = lerp(grad((uint8_t)aa, xf, yf), grad((uint8_t)ba, xf - 1.0f, yf), u);
  const float x2 = lerp(grad((uint8_t)ab, xf, yf - 1.0f), grad((uint8_t)bb, xf - 1.0f, yf - 1.0f), u);
  return lerp(x1, x2, v);
}

float Turbulence::fractalNoise(float x, float y) const
{
  float amplitude = 0.5f;
  float frequency = 1.0f;
  float total = 0.0f;
  float sumAmp = 0.0f;
  for (uint8_t i = 0; i < 4; ++i)
  {
    total += perlin2d(x * frequency, y * frequency) * amplitude;
    sumAmp += amplitude;
    amplitude *= 0.5f;
    frequency *= 2.0f;
  }
  if (sumAmp < kEpsilon)
  {
    return 0.0f;
  }
  return total / sumAmp;
}

float Turbulence::hash2d(float x, float y) const
{
  const float h = sinf(x * 127.1f + y * 311.7f) * 43758.5453f;
  return (h - floorf(h)) * 2.0f - 1.0f;
}

void Turbulence::rotateAroundCenter(float x, float y, float centerX, float centerY, float angle, float &outX, float &outY) const
{
  if (fabsf(angle) <= 0.0001f)
  {
    outX = x;
    outY = y;
    return;
  }
  const float tx = x - centerX;
  const float ty = y - centerY;
  const float c = cosf(-angle);
  const float s = sinf(-angle);
  outX = tx * c - ty * s + centerX;
  outY = tx * s + ty * c + centerY;
}

void Turbulence::applyDomainWarp(float x, float y, float time, float &outX, float &outY) const
{
  const float amount = config_->turbDomainWarp;
  if (amount <= kEpsilon)
  {
    outX = x;
    outY = y;
    return;
  }
  const float warpFreq = 2.0f;
  const float speed = config_->turbSpeed;
  const float warpSpeed = config_->turbDomainWarpSpeed;
  const float t = (speed > 0.0f && warpSpeed > 0.0f) ? (time * speed * warpSpeed) : 0.0f;
  outX = x + amount * sinf(y * warpFreq + t);
  outY = y + amount * cosf(x * warpFreq + t);
}

void Turbulence::applySymmetry(float x, float y, float centerX, float centerY, float &outX, float &outY) const
{
  const float amount = config_->turbSymmetryAmount;
  if (amount <= kEpsilon)
  {
    outX = x;
    outY = y;
    return;
  }
  const float dx = x - centerX;
  const float dy = y - centerY;
  const float dist = sqrtf(dx * dx + dy * dy);
  const float angle = atan2f(dy, dx);
  const float foldedAngle = angle * (1.0f + amount);
  outX = centerX + dist * cosf(foldedAngle);
  outY = centerY + dist * sinf(foldedAngle);
}

float Turbulence::applyPattern(uint8_t style, float x, float y, float centerX, float centerY, float time, float baseNoise) const
{
  const float freq = config_->turbPatternFrequency;
  const float dx = x - centerX;
  const float dy = y - centerY;
  const float dist = sqrtf(dx * dx + dy * dy);
  const float angle = atan2f(dy, dx);

  switch (style)
  {
  case 0: // Checkerboard
    return sinf(x * freq * kPi) * sinf(y * freq * kPi);
  case 1: // Waves
    return sinf((x + y * 0.5f) * freq * kTwoPi + time * config_->turbSpeed);
  case 2: // Spiral
    return sinf(angle * freq + dist * freq * kTwoPi);
  case 3: // Vortex
    return sinf(angle * freq + dist * 8.0f);
  case 4: // Radial
    return cosf(dist * freq * kTwoPi);
  case 5: // Cross
    return 0.5f * (sinf(x * freq * kPi) + sinf(y * freq * kPi));
  case 6: // Diamond
    return sinf((x + y) * freq * kPi) * cosf((x - y) * freq * kPi);
  case 7: // Hexagonal
  {
    const float qx = x * 1.7320508f;
    const float qy = y + x * 0.5f;
    return 0.5f * (sinf(qx * freq * kPi) + cosf(qy * freq * kPi));
  }
  case 8: // Concentric
    return sinf(dist * freq * 12.0f + time * config_->turbSpeed);
  case 9: // Grid
    return 0.5f * (sinf(x * freq * kTwoPi) + sinf(y * freq * kTwoPi));
  case 10: // Noise
    return baseNoise;
  case 11: // Turbulent
    return fractalNoise(x * freq, y * freq);
  case 12: // Flow
    return sinf((x * 1.7f + y * 0.6f) * freq * kTwoPi + time * config_->turbSpeed * 0.7f);
  case 13: // Cellular
  {
    const float cellSize = 1.0f / (freq + 0.1f);
    const float gx = floorf(x / cellSize);
    const float gy = floorf(y / cellSize);
    float minDist = 10.0f;
    for (int oy = 0; oy <= 1; ++oy)
    {
      for (int ox = 0; ox <= 1; ++ox)
      {
        const float cx = (gx + (float)ox + 0.5f) * cellSize;
        const float cy = (gy + (float)oy + 0.5f) * cellSize;
        const float ddx = x - cx;
        const float ddy = y - cy;
        const float d = sqrtf(ddx * ddx + ddy * ddy);
        if (d < minDist)
        {
          minDist = d;
        }
      }
    }
    return cosf(minDist * freq * 20.0f);
  }
  case 14: // Random
    return hash2d(x + time * 0.3f, y - time * 0.2f);
  default:
    return sinf(x * freq * kPi) * sinf(y * freq * kPi);
  }
}

float Turbulence::clamp01(float v) const
{
  if (v < 0.0f)
  {
    return 0.0f;
  }
  if (v > 1.0f)
  {
    return 1.0f;
  }
  return v;
}

float Turbulence::clampSigned(float v, float limit) const
{
  if (v > limit)
  {
    return limit;
  }
  if (v < -limit)
  {
    return -limit;
  }
  return v;
}

float Turbulence::applyPullContrastSeparation(float value01) const
{
  float value = clamp01(value01);
  const float pull = config_->turbPullFactor;
  if (fabsf(pull) > kEpsilon)
  {
    if (pull < 0.0f)
    {
      value = value * (1.0f + pull) + (1.0f - value) * (-pull);
    }
    else
    {
      if (value > 0.5f)
      {
        value = 0.5f + (value - 0.5f) * (1.0f + pull * 3.0f);
      }
      else
      {
        value = value * (1.0f - pull * 0.5f);
      }
    }
    value = clamp01(value);
  }

  const float contrast = config_->turbContrast;
  if (contrast > kEpsilon)
  {
    const float centered = value - 0.5f;
    const float gain = 1.0f + contrast * 6.0f;
    value = 0.5f + centered * gain;
    value = clamp01(value);
  }

  const float separation = config_->turbSeparation;
  if (separation > kEpsilon)
  {
    const float centered = value - 0.5f;
    const float sepFactor = 1.0f + separation * 12.0f;
    value = 1.0f / (1.0f + expf(-centered * sepFactor * 2.0f));
  }

  return clamp01(value);
}

float Turbulence::applyPreviewContrastSeparation(float value01) const
{
  float value = clamp01(value01);

  // Preview path intentionally excludes pull-mode inversion so noise view stays readable.
  const float contrast = config_->turbContrast;
  if (contrast > kEpsilon)
  {
    const float centered = value - 0.5f;
    const float gain = 1.0f + contrast * 6.0f;
    value = 0.5f + centered * gain;
    value = clamp01(value);
  }

  const float separation = config_->turbSeparation;
  if (separation > kEpsilon)
  {
    const float centered = value - 0.5f;
    const float sepFactor = 1.0f + separation * 12.0f;
    value = 1.0f / (1.0f + expf(-centered * sepFactor * 2.0f));
  }

  return clamp01(value);
}

namespace
{
constexpr uint16_t kHighParticleThreshold = 80;
}

float Turbulence::sampleFieldNoBlur(float x, float y, float time, bool applyPostProcess, bool fastPath) const
{
  float px = x;
  float py = y;
  const float centerX = kCenter;
  const float centerY = kCenter;

  const float rotation = config_->turbRotation + time * config_->turbRotationSpeed;
  rotateAroundCenter(px, py, centerX, centerY, rotation, px, py);

  const float scale = config_->turbScale;
  if (scale > kEpsilon)
  {
    px = (px - centerX) * scale + centerX;
    py = (py - centerY) * scale + centerY;
  }

  if (!fastPath)
  {
    applyDomainWarp(px, py, time, px, py);
    applySymmetry(px, py, centerX, centerY, px, py);
  }

  const float baseNoise = perlin2d(px * 3.0f + time * 0.5f, py * 3.0f - time * 0.5f);
  float value = applyPattern(config_->turbPatternStyle, px, py, centerX, centerY, time, baseNoise);

  const float phaseOffset = time * config_->turbSpeed * config_->turbPhaseSpeed + config_->turbPhase * kTwoPi;
  value = sinf(value * kTwoPi + phaseOffset);

  if (!applyPostProcess)
  {
    return clamp01(value * 0.5f + 0.5f) * 2.0f - 1.0f;
  }

  float post = value * 0.5f + 0.5f;
  post = applyPullContrastSeparation(post);
  return post * 2.0f - 1.0f;
}

float Turbulence::sampleField(float x, float y, float time, bool fastPath) const
{
  const float blur = fastPath ? 0.0f : config_->turbBlurAmount;
  if (blur <= kEpsilon)
  {
    return sampleFieldNoBlur(x, y, time, true, fastPath);
  }

  const float radius = 0.05f * clamp01(blur * 0.5f);
  float sum = sampleFieldNoBlur(x, y, time, true, false);
  sum += sampleFieldNoBlur(x + radius, y, time, true, false);
  sum += sampleFieldNoBlur(x - radius, y, time, true, false);
  sum += sampleFieldNoBlur(x, y + radius, time, true, false);
  sum += sampleFieldNoBlur(x, y - radius, time, true, false);
  return sum * 0.2f;
}

float Turbulence::sampleField01(float x, float y, float tNow) const
{
  const float n = sampleNoisePreview01(x, y, tNow) * 2.0f - 1.0f;
  return clamp01(n * 0.5f + 0.5f);
}

float Turbulence::sampleNoisePreview01(float x, float y, float tNow) const
{
  const float blur = config_->turbBlurAmount;
  if (blur <= kEpsilon)
  {
    const float n = sampleFieldNoBlur(x, y, tNow, false, false);
    return applyPreviewContrastSeparation(clamp01(n * 0.5f + 0.5f));
  }

  const float radius = 0.05f * clamp01(blur * 0.5f);
  float sum = sampleFieldNoBlur(x, y, tNow, false, false);
  sum += sampleFieldNoBlur(x + radius, y, tNow, false, false);
  sum += sampleFieldNoBlur(x - radius, y, tNow, false, false);
  sum += sampleFieldNoBlur(x, y + radius, tNow, false, false);
  sum += sampleFieldNoBlur(x, y - radius, tNow, false, false);
  return applyPreviewContrastSeparation(clamp01((sum * 0.2f) * 0.5f + 0.5f));
}

void Turbulence::apply(float *x, float *y, float *vx, float *vy, float *particleRadii, uint16_t count, float dt, float tNow)
{
  const uint32_t startUs = micros();
  const float strength = config_->turbStrength;
  const bool affectScale = config_->turbAffectScale;
  if (fabsf(strength) <= 1e-6f && !affectScale)
  {
    lastApplyMs_ = 0.0f;
    avgApplyMs_ = avgApplyMs_ * 0.97f;
    return;
  }
  const float pullFactor = config_->turbPullFactor;
  const float directionBiasX = config_->turbDirectionBiasX * config_->turbBiasStrength;
  const float directionBiasY = config_->turbDirectionBiasY * config_->turbBiasStrength;
  const bool scaleField = config_->turbScaleField;
  const bool affectPos = config_->turbAffectPosition;
  const float decay = config_->turbDecayRate;

  const bool fastPath = (count > kHighParticleThreshold);

  for (uint16_t i = 0; i < count; ++i)
  {
    float newVx = vx[i] * decay;
    float newVy = vy[i] * decay;

    // JS parity: direction bias only applies while affecting position.
    if (affectPos && (fabsf(directionBiasX) > kEpsilon || fabsf(directionBiasY) > kEpsilon))
    {
      newVx += directionBiasX * strength * dt;
      newVy += directionBiasY * strength * dt;
    }

    const float n1 = sampleField(x[i], y[i], tNow, fastPath);

    if (affectPos)
    {
      const float eps = 0.01f;
      const float nx = sampleField(x[i] + eps, y[i], tNow, fastPath);
      const float ny = sampleField(x[i], y[i] + eps, tNow, fastPath);
      const float gradX = (nx - n1) / eps;
      const float gradY = (ny - n1) / eps;
      const float gradMag = sqrtf(gradX * gradX + gradY * gradY);

      if (gradMag > 0.001f)
      {
        float dirX = gradX / gradMag;
        float dirY = gradY / gradMag;

        if (pullFactor > 0.0f)
        {
          const float pullStrength = pullFactor * strength;
          newVx += dirX * pullStrength * dt;
          newVy += dirY * pullStrength * dt;
        }
        else if (pullFactor < 0.0f)
        {
          if (pullFactor > -0.5f)
          {
            dirX = -dirX;
            dirY = -dirY;
          }
          const float pushStrength = fabsf(pullFactor) * strength;
          newVx += dirX * pushStrength * dt;
          newVy += dirY * pushStrength * dt;
        }
      }
    }

    // JS parity: field scaling uses sampled noise directly.
    if (scaleField)
    {
      const float scaleFactorField = 1.0f + (n1 - 0.5f) * strength * 0.1f;
      newVx *= scaleFactorField;
      newVy *= scaleFactorField;
    }

    // JS parity: per-particle size modulation.
    if (affectScale && particleRadii)
    {
      const float maxSize = config_->particleRadius;
      float minSize = config_->turbMinScale;
      if (minSize > maxSize)
        minSize = maxSize;
      float finalSize = minSize + n1 * (maxSize - minSize);
      if (finalSize < minSize)
        finalSize = minSize;
      if (finalSize > maxSize)
        finalSize = maxSize;
      particleRadii[i] = finalSize;
    }
    else if (particleRadii)
    {
      particleRadii[i] = config_->particleRadius;
    }

    vx[i] = clampSigned(newVx, 8.0f);
    vy[i] = clampSigned(newVy, 8.0f);
  }

  lastApplyMs_ = (micros() - startUs) / 1000.0f;
  if (avgApplyMs_ <= kEpsilon)
  {
    avgApplyMs_ = lastApplyMs_;
  }
  else
  {
    avgApplyMs_ = avgApplyMs_ * 0.9f + lastApplyMs_ * 0.1f;
  }
}
