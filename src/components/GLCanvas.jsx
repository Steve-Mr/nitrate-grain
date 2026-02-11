import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

const VS_SOURCE = `#version 300 es
  in vec2 a_position;
  out vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_position * 0.5 + 0.5;
    v_texCoord.y = 1.0 - v_texCoord.y;
  }
`;

const FS_SOURCE = `#version 300 es
  precision highp float;
  precision highp usampler2D;
  precision highp sampler3D;

  in vec2 v_texCoord;
  uniform usampler2D u_image;
  uniform float u_maxVal;
  uniform int u_channels;

  // LUT Uniforms
  uniform mediump sampler3D u_lut3d;
  uniform int u_use_lut;
  uniform float u_lut_size;

  // Stage 1: WB
  uniform vec3 u_wb_multipliers;

  // Stage 2 & 3: Color Matrices
  uniform mat3 u_cam_to_prophoto;
  uniform mat3 u_prophoto_to_target;

  // Stage 4: Log Curve Selection
  uniform int u_log_curve_type;

  // New Uniforms for Pipeline Parity
  uniform float u_exposure;
  uniform float u_saturation;
  uniform float u_contrast;
  uniform float u_input_gamma;

  // Advanced Tone Mapping
  uniform float u_highlights;
  uniform float u_shadows;
  uniform float u_whites;
  uniform float u_blacks;

  out vec4 outColor;

  // Helper for Saturation and Contrast
  vec3 applySaturation(vec3 color, float saturation) {
      // ProPhoto Luma Coefficients
      const vec3 lumaCoef = vec3(0.288040, 0.711874, 0.000086);
      float luminance = dot(color, lumaCoef);
      return mix(vec3(luminance), color, saturation);
  }

  vec3 applyContrast(vec3 color, float contrast) {
      return (color - 0.18) * contrast + 0.18;
  }

  // Tone Mapping Helper (Shadows/Highlights)
  // Uses a standard Luma-based gain approach to simulate recovery
  vec3 applyShadowsHighlights(vec3 color, float shadows, float highlights) {
      // ProPhoto Luma Coefficients
      const vec3 lumaCoef = vec3(0.288040, 0.711874, 0.000086);
      float luminance = dot(color, lumaCoef);

      // Shadows: Affects darks (0.0 - 0.5)
      // 1.0 - smoothstep(0.0, 0.5, luma) creates a mask that is 1.0 at black, 0.0 at gray
      float shadowMask = 1.0 - smoothstep(0.0, 0.5, luminance);

      // Highlights: Affects brights (0.5 - 1.0)
      // smoothstep(0.5, 1.0, luma) creates a mask that is 0.0 at gray, 1.0 at white
      float highlightMask = smoothstep(0.5, 1.0, luminance);

      // Apply adjustments
      // Shadows: Lift (positive) or Crush (negative)
      // We use a gain factor: (1.0 + strength * mask * scale)
      // Scale 0.5 keeps it subtle and prevents clipping issues
      color *= (1.0 + shadows * shadowMask * 0.5);

      // Highlights: Boost (positive) or Recover/Darken (negative)
      color *= (1.0 + highlights * highlightMask * 0.5);

      return color;
  }

  // Levels Helper (Whites/Blacks)
  vec3 applyLevels(vec3 color, float whites, float blacks) {
      // Blacks: Offset the black point.
      // Slider -1..1 -> Offset -0.1..0.1 (approx 10% swing)
      // Negative slider = Higher Black Point (Clipping) -> Subtract
      // Positive slider = Lower Black Point (Lift) -> Add ?
      // Standard Lightroom behavior:
      // Blacks +: Lifts blacks (adds offset).
      // Blacks -: Crushes blacks (subtracts offset / clips).
      float blackOffset = blacks * 0.1;

      // Whites: Scale the white point.
      // Slider -1..1 -> Gain adjustment
      // Whites +: Increases gain (brighter whites).
      // Whites -: Decreases gain (dimmer whites).
      float whiteGain = 1.0 + (whites * 0.5);

      return (color + blackOffset) * whiteGain;
  }

  // Apply 3D LUT with Half-Texel Correction
  vec3 applyLUT(vec3 color) {
      // Half-texel correction for accurate sampling
      // uv = input * ((size - 1.0) / size) + (0.5 / size)
      vec3 scale = vec3((u_lut_size - 1.0) / u_lut_size);
      vec3 offset = vec3(0.5 / u_lut_size);

      vec3 coord = color * scale + offset;
      return texture(u_lut3d, coord).rgb;
  }

  // Helper for log10 (must be defined before usage)
  float log10(float x) {
      return log(x) / 2.302585093;
  }

  // --- LOG FUNCTIONS ---

  // 0. Arri LogC3 (EI 800)
  float logC3_EI800(float x) {
      const float cut = 0.010591;
      const float a = 5.555556;
      const float b = 0.052272;
      const float c = 0.247190;
      const float d = 0.385537;
      const float e = 5.367655;
      const float f = 0.092809;
      if (x > cut) return c * log10(a * x + b) + d;
      return e * x + f;
  }

  // 1. Fujifilm F-Log
  float fLog(float x) {
      const float cut1 = 0.00089;
      const float a = 0.555556;
      const float b = 0.009468;
      const float c = 0.344676;
      const float d = 0.790453;
      const float e = 8.735631;
      const float f = 0.092864;
      if (x < cut1) return e * x + f;
      return c * log10(a * x + b) + d;
  }

  // 2. Fujifilm F-Log2
  float fLog2(float x) {
      const float cut1 = 0.000889;
      const float a = 5.555556;
      const float b = 0.064829;
      const float c = 0.245281;
      const float d = 0.384316;
      const float e = 8.799461;
      const float f = 0.092864;
      if (x < cut1) return e * x + f;
      return c * log10(a * x + b) + d;
  }

  // 3. Sony S-Log3
  float sLog3(float x) {
      if (x >= 0.01125000) return (420.0 + log10((x + 0.01) / (0.18 + 0.01)) * 261.5) / 1023.0;
      return (x * (171.2102946929 - 95.0) / 0.01125000 + 95.0) / 1023.0;
  }

  // 4. Panasonic V-Log
  float vLog(float x) {
      const float cut1 = 0.01;
      const float b = 0.00873;
      const float c = 0.241514;
      const float d = 0.598206;
      if (x < cut1) return 5.6 * x + 0.125;
      return c * log10(x + b) + d;
  }

  // 5. Canon Log 2 (v1.2)
  float canonLog2(float x) {
      if (x < 0.0) return -(0.24136077 * log10(-x * 87.09937546 + 1.0) - 0.092864125);
      return 0.24136077 * log10(x * 87.09937546 + 1.0) + 0.092864125;
  }

  // 6. Canon Log 3 (v1.2)
  float canonLog3(float x) {
      if (x < 0.014) return 1.9754798 * x + 0.12512219;
      return 0.36726845 * log10(x * 14.98325 + 1.0) + 0.12240537;
  }

  // 7. Nikon N-Log
  float nLog(float x) {
      const float cut1 = 0.328;
      const float a = 0.635396;
      const float b = 0.0075;
      const float c = 0.146628;
      const float d = 0.605083;
      if (x < cut1) return a * pow(x + b, 1.0/3.0);
      return c * log(x) + d;
  }

  // 8. DJI D-Log
  float dLog(float x) {
     if (x <= 0.0078) return 6.025 * x + 0.0929;
     return log10(x * 0.9892 + 0.0108) * 0.256663 + 0.584555;
  }

  // 9. RED Log3G10 (v3)
  float log3G10(float x) {
      const float a = 0.224282;
      const float b = 155.975327;
      const float c = 0.01;
      float x_off = x + c;
      return a * log10(x_off * b + 1.0);
  }

  // 10. None (sRGB)
  float srgb_transfer(float x) {
      if (x <= 0.0031308) return 12.92 * x;
      return 1.055 * pow(x, 1.0/2.4) - 0.055;
  }

  vec3 applyLogCurve(vec3 linearColor, int curveType) {
      vec3 res;
      if (curveType == 0) {
         res.r = logC3_EI800(linearColor.r);
         res.g = logC3_EI800(linearColor.g);
         res.b = logC3_EI800(linearColor.b);
      } else if (curveType == 1) {
         res.r = fLog(linearColor.r);
         res.g = fLog(linearColor.g);
         res.b = fLog(linearColor.b);
      } else if (curveType == 2) {
         res.r = fLog2(linearColor.r);
         res.g = fLog2(linearColor.g);
         res.b = fLog2(linearColor.b);
      } else if (curveType == 3) {
         res.r = sLog3(linearColor.r);
         res.g = sLog3(linearColor.g);
         res.b = sLog3(linearColor.b);
      } else if (curveType == 4) {
         res.r = vLog(linearColor.r);
         res.g = vLog(linearColor.g);
         res.b = vLog(linearColor.b);
      } else if (curveType == 5) {
         res.r = canonLog2(linearColor.r);
         res.g = canonLog2(linearColor.g);
         res.b = canonLog2(linearColor.b);
      } else if (curveType == 6) {
         res.r = canonLog3(linearColor.r);
         res.g = canonLog3(linearColor.g);
         res.b = canonLog3(linearColor.b);
      } else if (curveType == 7) {
         res.r = nLog(linearColor.r);
         res.g = nLog(linearColor.g);
         res.b = nLog(linearColor.b);
      } else if (curveType == 8) {
         res.r = dLog(linearColor.r);
         res.g = dLog(linearColor.g);
         res.b = dLog(linearColor.b);
      } else if (curveType == 9) {
         res.r = log3G10(linearColor.r);
         res.g = log3G10(linearColor.g);
         res.b = log3G10(linearColor.b);
      } else if (curveType == 10) {
         res.r = srgb_transfer(linearColor.r);
         res.g = srgb_transfer(linearColor.g);
         res.b = srgb_transfer(linearColor.b);
      } else {
         res.r = logC3_EI800(linearColor.r);
         res.g = logC3_EI800(linearColor.g);
         res.b = logC3_EI800(linearColor.b);
      }
      return res;
  }

  void main() {
    uvec4 rawVal = texture(u_image, v_texCoord);

    vec3 linear_cam;
    if (u_channels == 1) {
      float val = float(rawVal.r) / u_maxVal;
      linear_cam = vec3(val);
    } else {
      linear_cam = vec3(rawVal.rgb) / u_maxVal;
    }

    if (u_input_gamma > 1.0) {
        linear_cam = pow(linear_cam, vec3(u_input_gamma));
    }

    vec3 wb_cam = linear_cam * u_wb_multipliers;
    vec3 prophoto_linear = u_cam_to_prophoto * wb_cam;
    prophoto_linear *= pow(2.0, u_exposure);
    prophoto_linear = applyLevels(prophoto_linear, u_whites, u_blacks);
    prophoto_linear = applyShadowsHighlights(prophoto_linear, u_shadows, u_highlights);
    prophoto_linear = applySaturation(prophoto_linear, u_saturation);
    prophoto_linear = applyContrast(prophoto_linear, u_contrast);
    vec3 target_linear = u_prophoto_to_target * prophoto_linear;
    target_linear = max(target_linear, 0.0);
    vec3 log_image = applyLogCurve(target_linear, u_log_curve_type);
    vec3 final_color = log_image;
    if (u_use_lut == 1) {
        final_color = applyLUT(log_image);
    }
    outColor = vec4(final_color, 1.0);
  }
`;

const setGLUniforms = (gl, program, props, lutTexture) => {
  const {
    bitDepth, channels, wbMultipliers, camToProPhotoMatrix, proPhotoToTargetMatrix,
    logCurveType, exposure, saturation, contrast, highlights, shadows, whites, blacks,
    inputGamma, lutData, lutSize
  } = props;

  gl.useProgram(program);

  gl.uniform1f(gl.getUniformLocation(program, 'u_maxVal'), bitDepth === 16 ? 65535.0 : 255.0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_channels'), channels);
  gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_lut3d'), 1);

  if (lutTexture && lutData && lutSize) {
     gl.activeTexture(gl.TEXTURE1);
     gl.bindTexture(gl.TEXTURE_3D, lutTexture);
     gl.uniform1i(gl.getUniformLocation(program, 'u_use_lut'), 1);
     gl.uniform1f(gl.getUniformLocation(program, 'u_lut_size'), lutSize);
  } else {
     gl.activeTexture(gl.TEXTURE1);
     gl.bindTexture(gl.TEXTURE_3D, null);
     gl.uniform1i(gl.getUniformLocation(program, 'u_use_lut'), 0);
  }

  const wb = wbMultipliers || [1.0, 1.0, 1.0];
  gl.uniform3f(gl.getUniformLocation(program, 'u_wb_multipliers'), wb[0], wb[1], wb[2]);

  const identity = new Float32Array([1,0,0, 0,1,0, 0,0,1]);
  gl.uniformMatrix3fv(gl.getUniformLocation(program, 'u_cam_to_prophoto'), true, camToProPhotoMatrix || identity);
  gl.uniformMatrix3fv(gl.getUniformLocation(program, 'u_prophoto_to_target'), true, proPhotoToTargetMatrix || identity);
  gl.uniform1i(gl.getUniformLocation(program, 'u_log_curve_type'), logCurveType !== undefined ? logCurveType : 0);

  gl.uniform1f(gl.getUniformLocation(program, 'u_exposure'), exposure !== undefined ? exposure : 0.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_saturation'), saturation !== undefined ? saturation : 1.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_contrast'), contrast !== undefined ? contrast : 1.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_input_gamma'), inputGamma !== undefined ? inputGamma : 1.0);

  gl.uniform1f(gl.getUniformLocation(program, 'u_highlights'), highlights !== undefined ? highlights : 0.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_shadows'), shadows !== undefined ? shadows : 0.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_whites'), whites !== undefined ? whites : 0.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_blacks'), blacks !== undefined ? blacks : 0.0);
};

const GLCanvas = forwardRef((props, ref) => {
  const { width, height, data, channels, bitDepth, wbMultipliers, camToProPhotoMatrix, proPhotoToTargetMatrix, logCurveType, exposure, saturation, contrast, highlights, shadows, whites, blacks, inputGamma, lutData, lutSize, onRender, renderId } = props;
  const canvasRef = useRef(null);

  const glRef = useRef(null);
  const programRef = useRef(null);
  const textureRef = useRef(null);
  const lutTextureRef = useRef(null);
  const vaoRef = useRef(null);
  const positionBufferRef = useRef(null);
  const vsRef = useRef(null);
  const fsRef = useRef(null);

  useImperativeHandle(ref, () => {
    const captureHighRes = () => {
      const gl = glRef.current;
      const program = programRef.current;
      const texture = textureRef.current;
      const lutTexture = lutTextureRef.current;
      const vao = vaoRef.current;

      if (!gl || !program || !texture || !vao) {
          throw new Error("WebGL context or resources not initialized");
      }

      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

      const targetTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, targetTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, targetTex, 0);

      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
          console.error("Framebuffer incomplete:", status);
          return null;
      }

      gl.viewport(0, 0, width, height);
      gl.useProgram(program);
      gl.bindVertexArray(vao);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);

      setGLUniforms(gl, program, props, lutTexture);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      const pixelData = new Float32Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, pixelData);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(targetTex);

      return { width, height, data: pixelData, channels: 4 };
    };

    const getStatistics = () => {
        try {
            const result = captureHighRes();
            if (!result || !result.data) return null;
            const { data } = result;
            let min = 100.0, max = -100.0, sum = 0.0;
            let count = 0;
            const step = Math.max(1, Math.floor(data.length / 400000));
            for(let i = 0; i < data.length; i += step * 4) {
                const r = data[i], g = data[i+1], b = data[i+2];
                const val = (r + g + b) / 3.0;
                if (val < min) min = val;
                if (val > max) max = val;
                sum += val;
                count++;
            }
            return { min, max, mean: sum / count, sampleCount: count };
        } catch (e) {
            console.error("Stats calculation failed:", e);
            return null;
        }
    };

    return { captureHighRes, getStatistics };
  });

  // 1. Initialize GL Context
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
    if (!gl) {
      console.error("WebGL 2.0 not supported");
      return;
    }

    glRef.current = gl;
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');

    return () => {
      glRef.current = null;
    };
  }, []);

  // 2. Compile Shaders & Link Program
  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;

    const createShader = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    };

    const vs = createShader(gl.VERTEX_SHADER, VS_SOURCE);
    const fs = createShader(gl.FRAGMENT_SHADER, FS_SOURCE);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return;
    }

    programRef.current = program;
    vsRef.current = vs;
    fsRef.current = fs;

    return () => {
      if (programRef.current) gl.deleteProgram(programRef.current);
      if (vsRef.current) gl.deleteShader(vsRef.current);
      if (fsRef.current) gl.deleteShader(fsRef.current);
      programRef.current = null;
      vsRef.current = null;
      fsRef.current = null;
    };
  }, []);

  // 3. Setup Geometry
  useEffect(() => {
    const gl = glRef.current;
    const program = programRef.current;
    if (!gl || !program) return;

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const positionLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    vaoRef.current = vao;
    positionBufferRef.current = positionBuffer;

    return () => {
        if (vaoRef.current) gl.deleteVertexArray(vaoRef.current);
        if (positionBufferRef.current) gl.deleteBuffer(positionBufferRef.current);
        vaoRef.current = null;
        positionBufferRef.current = null;
    };
  }, []);

  // 4. Resize Canvas & Viewport
  useEffect(() => {
      const canvas = canvasRef.current;
      const gl = glRef.current;
      if (!canvas || !gl) return;

      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
  }, [width, height]);

  // 5a. Main Texture Management
  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !data) return;

    if (textureRef.current) gl.deleteTexture(textureRef.current);

    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    let internalFormat, format, type;
    if (bitDepth === 16) {
        type = gl.UNSIGNED_SHORT;
        if (channels === 1) {
            internalFormat = gl.R16UI;
            format = gl.RED_INTEGER;
        } else {
            internalFormat = gl.RGB16UI;
            format = gl.RGB_INTEGER;
        }
    } else {
        type = gl.UNSIGNED_BYTE;
        if (channels === 1) {
            internalFormat = gl.R8UI;
            format = gl.RED_INTEGER;
        } else {
            internalFormat = gl.RGB8UI;
            format = gl.RGB_INTEGER;
        }
    }

    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    textureRef.current = texture;

    return () => {
        if (textureRef.current) gl.deleteTexture(textureRef.current);
        textureRef.current = null;
    };
  }, [data, width, height, channels, bitDepth]);

  // 5b. LUT Texture Management
  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;

    if (lutTextureRef.current) gl.deleteTexture(lutTextureRef.current);

    if (lutData && lutSize) {
        const lutTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_3D, lutTexture);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB32F, lutSize, lutSize, lutSize, 0, gl.RGB, gl.FLOAT, lutData);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        lutTextureRef.current = lutTexture;
    }

    return () => {
        if (lutTextureRef.current) gl.deleteTexture(lutTextureRef.current);
        lutTextureRef.current = null;
    };
  }, [lutData, lutSize]);

  // 6. Final Render
  useEffect(() => {
    const gl = glRef.current;
    const program = programRef.current;
    const vao = vaoRef.current;
    const texture = textureRef.current;

    if (!gl || !program || !vao || !texture) return;

    try {
        gl.useProgram(program);
        gl.bindVertexArray(vao);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);

        setGLUniforms(gl, program, props, lutTextureRef.current);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        if (onRender) {
             requestAnimationFrame(() => onRender(renderId));
        }
    } catch (e) {
        console.error("WebGL Rendering Error:", e);
    }
  }, [
      width, height, data, channels, bitDepth, wbMultipliers, camToProPhotoMatrix,
      proPhotoToTargetMatrix, logCurveType, exposure, saturation, contrast,
      highlights, shadows, whites, blacks, inputGamma, lutData, lutSize,
      onRender, renderId
  ]);

  return <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />;
});

export default GLCanvas;
