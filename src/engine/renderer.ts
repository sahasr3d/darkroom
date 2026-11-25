import { ANALOG_SRC, FILM_SRC, OPTICS_SRC, VERTEX_SRC } from './gl/shaders'
import type { LookParams } from './look'

export type SrcRect = readonly [number, number, number, number]

export type SourceSlot = 0 | 1

export interface RenderRequest {
  /** Which uploaded source texture to develop. */
  slot: SourceSlot
  look: LookParams
  width: number
  height: number
  srcRect: SrcRect
  seed: number
  time: number
  /** Second exposure for double-exposure mode: which source texture and its crop. */
  second?: { slot: SourceSlot; srcRect: SrcRect }
}

export class WebGLUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebGLUnavailableError'
  }
}

interface Target {
  tex: WebGLTexture
  fb: WebGLFramebuffer
  w: number
  h: number
}

interface Pass {
  program: WebGLProgram
  locations: Map<string, WebGLUniformLocation | null>
}

const SPECIAL_NAMES: Partial<Record<keyof LookParams, string>> = { ca: 'uCA', staticNoise: 'uStatic' }
export const uniformName = (key: keyof LookParams): string => SPECIAL_NAMES[key] ?? `u${key[0].toUpperCase()}${key.slice(1)}`

function compile(gl: WebGL2RenderingContext, type: number, src: string, label: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new WebGLUnavailableError(`Could not allocate the ${label} shader`)
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown error'
    gl.deleteShader(shader)
    throw new WebGLUnavailableError(`${label} shader failed to compile: ${log}`)
  }
  return shader
}

/** Row-major Mat3 → column-major Float32Array, as GLSL expects. */
function toColumnMajor(m: readonly number[]): Float32Array {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]])
}

/**
 * Three-pass GPU renderer on one WebGL2 context:
 * optics (source → A), film & sensor (A → B), video & analog (B → canvas).
 * The 2D compositor reads `canvas` with drawImage() right after render().
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement
  readonly maxSize: number
  onRestored: (() => void) | null = null
  private gl: WebGL2RenderingContext
  private passes!: { optics: Pass; film: Pass; analog: Pass }
  private a!: Target
  private b!: Target
  /** Two source textures: the main frame and the paired frame (half-frame frame B). */
  private sources: { tex: WebGLTexture; size: [number, number]; last: TexImageSource | null; mips: boolean; hasMips: boolean }[] = []
  private lost = false

  constructor() {
    this.canvas = document.createElement('canvas')
    const gl = this.canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false })
    if (!gl) throw new WebGLUnavailableError('WebGL2 is not available in this browser')
    this.gl = gl
    this.maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number, 8192)
    this.init()
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.lost = true
    })
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false
      const previous = this.sources.map((s) => ({ last: s.last, size: s.size, mips: s.mips }))
      this.init()
      previous.forEach((p, i) => {
        if (!p.last) return
        try {
          this.upload(i as SourceSlot, p.last, p.size[0], p.size[1], p.mips)
        } catch {
          // The source was released (e.g. a closed ImageBitmap); the next render re-uploads its successor.
          this.sources[i].last = null
        }
      })
      this.onRestored?.()
    })
  }

  get isLost(): boolean {
    return this.lost
  }

  private makeProgram(fragSrc: string, label: string): Pass {
    const gl = this.gl
    const program = gl.createProgram()
    if (!program) throw new WebGLUnavailableError(`Could not allocate the ${label} program`)
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SRC, 'vertex'))
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragSrc, label))
    gl.bindAttribLocation(program, 0, 'aPos')
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new WebGLUnavailableError(`${label} program failed to link: ${gl.getProgramInfoLog(program) ?? ''}`)
    }
    return { program, locations: new Map() }
  }

  private makeTexture(mipmapped: boolean): WebGLTexture {
    const gl = this.gl
    const tex = gl.createTexture()
    if (!tex) throw new WebGLUnavailableError('Could not allocate a texture')
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmapped ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }

  private makeTarget(mipmapped: boolean): Target {
    const gl = this.gl
    const tex = this.makeTexture(mipmapped)
    const fb = gl.createFramebuffer()
    if (!fb) throw new WebGLUnavailableError('Could not allocate a framebuffer')
    return { tex, fb, w: 0, h: 0 }
  }

  private init(): void {
    const gl = this.gl
    this.passes = {
      optics: this.makeProgram(OPTICS_SRC, 'optics'),
      film: this.makeProgram(FILM_SRC, 'film'),
      analog: this.makeProgram(ANALOG_SRC, 'analog'),
    }
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this.sources = [0, 1].map(() => ({ tex: this.makeTexture(true), size: [1, 1] as [number, number], last: null, mips: true, hasMips: false }))
    this.a = this.makeTarget(true)
    this.b = this.makeTarget(false)
  }

  private resizeTarget(t: Target, w: number, h: number): void {
    if (t.w === w && t.h === h) return
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, t.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new WebGLUnavailableError('Framebuffer is incomplete')
    t.w = w
    t.h = h
  }

  /**
   * Upload a source frame. Stills always get a mip chain (clean downscaled previews);
   * live frames only get one later if the current look needs blurred levels.
   */
  upload(slot: SourceSlot, source: TexImageSource, width: number, height: number, mips = true): void {
    const s = this.sources[slot]
    s.last = source
    s.size = [width, height]
    s.mips = mips
    if (this.lost) return
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, s.tex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    s.hasMips = mips
    if (mips) gl.generateMipmap(gl.TEXTURE_2D)
  }

  /** Make sure the source texture is complete for its current filter, building mips on demand. */
  private prepareSource(slot: SourceSlot, look: LookParams): WebGLTexture {
    const gl = this.gl
    const s = this.sources[slot]
    gl.bindTexture(gl.TEXTURE_2D, s.tex)
    // Any pass that blurs by raising textureLod (soft edges, starburst, tap-to-focus DOF) needs mips.
    const needsLod = look.softEdge > 0.001 || look.star > 0.001 || look.dof > 0.001 || Math.abs(look.parallax) > 0.0001
    if (needsLod && !s.hasMips) {
      gl.generateMipmap(gl.TEXTURE_2D)
      s.hasMips = true
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, s.hasMips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR)
    return s.tex
  }

  private loc(pass: Pass, name: string): WebGLUniformLocation | null {
    if (!pass.locations.has(name)) pass.locations.set(name, this.gl.getUniformLocation(pass.program, name))
    return pass.locations.get(name) ?? null
  }

  private setUniforms(pass: Pass, req: RenderRequest, input: WebGLTexture, w: number, h: number): void {
    const gl = this.gl
    gl.useProgram(pass.program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, input)
    gl.uniform1i(this.loc(pass, 'uTex'), 0)
    const size = this.sources[req.slot].size
    gl.uniform2f(this.loc(pass, 'uTexSize'), size[0], size[1])
    gl.uniform2f(this.loc(pass, 'uRes'), w, h)
    gl.uniform4f(this.loc(pass, 'uSrcRect'), ...req.srcRect)
    gl.uniform1f(this.loc(pass, 'uSeed'), req.seed % 9973)
    gl.uniform1f(this.loc(pass, 'uTime'), req.time)
    for (const key of Object.keys(req.look) as (keyof LookParams)[]) {
      const location = this.loc(pass, uniformName(key))
      if (!location) continue
      const v = req.look[key]
      if (typeof v === 'number') gl.uniform1f(location, v)
      else if (v.length === 9) gl.uniformMatrix3fv(location, false, toColumnMajor(v))
      else if (v.length === 2) gl.uniform2f(location, v[0], v[1])
      else gl.uniform3f(location, v[0], v[1], v[2])
    }
  }

  private draw(fb: WebGLFramebuffer | null, w: number, h: number): void {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.viewport(0, 0, w, h)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  render(req: RenderRequest): HTMLCanvasElement {
    const w = Math.max(1, Math.min(this.maxSize, Math.round(req.width)))
    const h = Math.max(1, Math.min(this.maxSize, Math.round(req.height)))
    if (this.canvas.width !== w) this.canvas.width = w
    if (this.canvas.height !== h) this.canvas.height = h
    if (this.lost) return this.canvas
    const gl = this.gl
    this.resizeTarget(this.a, w, h)
    this.resizeTarget(this.b, w, h)
    const sourceTex = this.prepareSource(req.slot, req.look)

    this.setUniforms(this.passes.optics, req, sourceTex, w, h)
    // Unit 1 always holds a complete texture: the second exposure, or the main source as a stand-in.
    const second = req.second ?? { slot: req.slot, srcRect: req.srcRect }
    const secondTex = this.sources[second.slot].tex
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, secondTex)
    if (secondTex !== sourceTex) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.sources[second.slot].hasMips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR)
    gl.uniform1i(this.loc(this.passes.optics, 'uTex2'), 1)
    gl.uniform4f(this.loc(this.passes.optics, 'uSrcRect2'), ...second.srcRect)
    gl.activeTexture(gl.TEXTURE0)
    this.draw(this.a.fb, w, h)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.a.tex)
    gl.generateMipmap(gl.TEXTURE_2D)

    this.setUniforms(this.passes.film, req, this.a.tex, w, h)
    this.draw(this.b.fb, w, h)

    this.setUniforms(this.passes.analog, req, this.b.tex, w, h)
    this.draw(null, w, h)
    return this.canvas
  }
}
