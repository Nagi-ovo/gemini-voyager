/**
 * Watermark Removal Engine - Credits & Attribution
 *
 * This module is based on gemini-watermark-remover by journey-ad (Jad),
 * which is a JavaScript port of the original C++ implementation by allenk.
 *
 * JS Project: https://github.com/journey-ad/gemini-watermark-remover
 * C++ Project: https://github.com/allenk/GeminiWatermarkTool
 * Original Author: journey-ad (Jad)
 * Original C++ Author: allenk
 * License: MIT License
 * Copyright (c) 2025 Jad
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * ---
 *
 * Algorithm Overview:
 * The algorithm implements Reverse Alpha Blending to remove Gemini AI watermarks:
 * - Gemini watermark formula: watermarked = α × logo + (1 - α) × original
 * - Reverse formula: original = (watermarked - α × logo) / (1 - α)
 *
 * By capturing the watermark on a known solid background, we reconstruct the exact
 * Alpha map and apply the inverse formula to restore the original pixels with zero loss.
 */

export const WATERMARK_REMOVER_CREDITS = {
  author: 'journey-ad (Jad)',
  repository: 'https://github.com/journey-ad/gemini-watermark-remover',
  license: 'MIT',
  copyright: 'Copyright (c) 2025 Jad',
} as const;
