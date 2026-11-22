use crate::config::params::{pattern, Params};

/// T-Pull steers Classic Drop. Reshape stays off so the slider does not
/// repaint the rings while it moves.
pub(crate) fn pull_reshape(p: &Params) -> f32 {
    if p.turb_pattern == pattern::CLASSIC_DROP {
        0.0
    } else {
        p.turb_pull
    }
}

/// pullReshape, bandpass contrast, then quantize (T-Quantize / turb_separation).
/// Content elements match JS `applyContrast` / C++ `reshape01`.
pub fn apply_contrast(mut value: f32, p: &Params) -> f32 {
    let pull_reshape = pull_reshape(p);
    let contrast_value = p.turb_contrast;
    let quantize = p.turb_separation;
    if pull_reshape == 0.0 && contrast_value <= 0.0 && quantize <= 0.0 {
        return value.clamp(0.0, 1.0);
    }
    if pull_reshape != 0.0 {
        if pull_reshape < 0.0 {
            value = value * (1.0 + pull_reshape) + (1.0 - value) * (-pull_reshape);
        } else if value > 0.5 {
            value = 0.5 + (value - 0.5) * (1.0 + pull_reshape * 3.0);
        } else {
            value *= 1.0 - pull_reshape * 0.5;
        }
        value = value.clamp(0.0, 1.0);
    }
    if contrast_value > 0.0 {
        let contrast_mid_point = p.turb_contrast_mid;
        let contrast_shadow_point = p.turb_contrast_shadow;
        let contrast_highlight_point = p.turb_contrast_high;
        let contrast_dark_boost = p.turb_contrast_dark;
        if value < contrast_mid_point {
            let span = contrast_mid_point - contrast_shadow_point;
            if span.abs() > 1e-6 {
                let shadow_range = (value - contrast_shadow_point) / span;
                if shadow_range > 0.0 {
                    let boosted_value = contrast_shadow_point
                        + shadow_range
                            * span
                            * shadow_range.powf(1.0 / (1.0 + contrast_dark_boost * contrast_value));
                    value = value * (1.0 - contrast_value) + boosted_value * contrast_value;
                }
            }
        } else if value < contrast_highlight_point {
            let span = contrast_highlight_point - contrast_mid_point;
            if span.abs() > 1e-6 {
                let transition_range = (value - contrast_mid_point) / span;
                let contrast_reduction = transition_range.powf(0.5);
                let adjusted_contrast = contrast_value * (1.0 - contrast_reduction);
                let mid_curve = contrast_mid_point
                    + (value - contrast_mid_point)
                        * transition_range.powf(1.0 - adjusted_contrast * 0.5);
                value = value * (1.0 - adjusted_contrast) + mid_curve * adjusted_contrast;
            }
        }
    }
    if quantize > 0.0 {
        let centered = value - 0.5;
        let sep_factor = 1.0 + quantize * 12.0;
        value = 1.0 / (1.0 + (-centered * sep_factor).exp());
    }
    value.clamp(0.0, 1.0)
}
