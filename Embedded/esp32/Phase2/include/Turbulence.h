#ifndef PHASE2_TURBULENCE_H
#define PHASE2_TURBULENCE_H

#include "SimConfig.h"

class Turbulence
{
public:
  explicit Turbulence(SimConfig *cfg);
  void apply(float *x, float *y, float *vx, float *vy, float *particleRadii, uint16_t count, float dt, float tNow);
  float sampleField01(float x, float y, float tNow) const;
  float getLastApplyMs() const { return lastApplyMs_; }
  float getAvgApplyMs() const { return avgApplyMs_; }

private:
  float fade(float t) const;
  float lerp(float a, float b, float t) const;
  float grad(uint8_t hash, float x, float y) const;
  float perlin2d(float x, float y) const;
  float fractalNoise(float x, float y) const;
  float hash2d(float x, float y) const;
  void rotateAroundCenter(float x, float y, float centerX, float centerY, float angle, float &outX, float &outY) const;
  void applyDomainWarp(float x, float y, float time, float &outX, float &outY) const;
  void applySymmetry(float x, float y, float centerX, float centerY, float &outX, float &outY) const;
  float applyPattern(uint8_t style, float x, float y, float centerX, float centerY, float time, float baseNoise) const;
  float applyPullContrastSeparation(float value01) const;
  float applyPreviewContrastSeparation(float value01) const;
  float sampleFieldNoBlur(float x, float y, float time, bool applyPostProcess, bool fastPath) const;
  float sampleField(float x, float y, float time, bool fastPath = false) const;
  float sampleNoisePreview01(float x, float y, float tNow) const;
  void initPermutation();
  float clamp01(float v) const;
  float clampSigned(float v, float limit) const;

  SimConfig *config_;
  uint8_t perm_[512];
  float lastApplyMs_ = 0.0f;
  float avgApplyMs_ = 0.0f;
};

#endif
