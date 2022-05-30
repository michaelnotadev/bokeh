import {build_view, build_views, remove_views} from "core/build_views"
import {display, div, empty, span, undisplay} from "core/dom"
import {Anchor, HoverMode, LinePolicy, MutedPolicy, PointPolicy, TooltipAttachment} from "core/enums"
import {Geometry, GeometryData, PointGeometry, SpanGeometry} from "core/geometry"
import * as hittest from "core/hittest"
import * as p from "core/properties"
import {Signal} from "core/signaling"
import {Arrayable, Color} from "core/types"
import {MoveEvent} from "core/ui_events"
import {color2css, color2hex} from "core/util/color"
import {enumerate} from "core/util/iterator"
import {is_empty} from "core/util/object"
import {Formatters, FormatterType, replace_placeholders} from "core/util/templating"
import {isFunction, isNumber, isString} from "core/util/types"
import {tool_icon_hover} from "styles/icons.css"
import * as styles from "styles/tooltips.css"
import {Tooltip, TooltipView} from "../../annotations/tooltip"
import {CallbackLike1} from "../../callbacks/callback"
import {Template, TemplateView} from "../../dom"
import {GlyphView} from '../../glyphs/glyph'
import {HAreaView} from "../../glyphs/harea"
import {LineView} from "../../glyphs/line"
import {MultiLineView} from "../../glyphs/multi_line"
import {PatchView} from "../../glyphs/patch"
import {VAreaView} from "../../glyphs/varea"
import {DataRenderer} from "../../renderers/data_renderer"
import {GlyphRenderer} from "../../renderers/glyph_renderer"
import {GraphRenderer} from "../../renderers/graph_renderer"
import {Renderer} from "../../renderers/renderer"
import {Selection} from "../../selections/selection"
import {ColumnarDataSource} from "../../sources/columnar_data_source"
import {compute_renderers} from "../../util"
import {CustomJSHover} from "./customjs_hover"
import {InspectTool, InspectToolView} from "./inspect_tool"

export type TooltipVars = {
    index: number | null,
    glyph: GlyphView,
    x: number,
    y: number,
    sx: number,
    sy: number,
    tt_x: number,
    tt_y: number,
    tt_sx: number,
    tt_sy: number,
    name: string | null,
    indices?: any | undefined,
    segment_index?: any | undefined,
}

export function _nearest_line_hit(i: number, geometry: Geometry,
    sx: number, sy: number, dx: Arrayable<number>, dy: Arrayable<number>): [[number, number], number] {
  const d1 = {x: dx[i], y: dy[i]}
  const d2 = {x: dx[i+1], y: dy[i+1]}

  let dist1: number
  let dist2: number
  if (geometry.type == "span") {
    if (geometry.direction == "h") {
      dist1 = Math.abs(d1.x - sx)
      dist2 = Math.abs(d2.x - sx)
    } else {
      dist1 = Math.abs(d1.y - sy)
      dist2 = Math.abs(d2.y - sy)
    }
  } else {
    const s = {x: sx, y: sy}
    dist1 = hittest.dist_2_pts(d1, s)
    dist2 = hittest.dist_2_pts(d2, s)
  }

  if (dist1 < dist2)
    return [[d1.x, d1.y], i]
  else
    return [[d2.x, d2.y], i+1]
}

export function _line_hit(xs: Arrayable<number>, ys: Arrayable<number>, ind: number): [[number, number], number] {
  return [[xs[ind], ys[ind]], ind]
}

export class HoverToolView extends InspectToolView {
  override model: HoverTool

  protected _ttviews: Map<Tooltip, TooltipView>
  protected _ttmodels: Map<GlyphRenderer, Tooltip>
  protected _template_el?: HTMLElement
  protected _template_view?: TemplateView

  override initialize(): void {
    super.initialize()
    this._ttmodels = new Map()
    this._ttviews = new Map()
  }

  override async lazy_initialize(): Promise<void> {
    await super.lazy_initialize()
    await this._update_ttmodels()

    const {tooltips} = this.model
    if (tooltips instanceof Template) {
      this._template_view = await build_view(tooltips, {parent: this})
      this._template_view.render()
    }
  }

  override remove(): void {
    this._template_view?.remove()
    remove_views(this._ttviews)
    super.remove()
  }

  override connect_signals(): void {
    super.connect_signals()

    const plot_renderers = this.plot_model.properties.renderers
    const {renderers, tooltips} = this.model.properties
    this.on_change(tooltips, () => delete this._template_el)
    this.on_change([plot_renderers, renderers, tooltips], async () => await this._update_ttmodels())
  }

  protected async _update_ttmodels(): Promise<void> {
    const {ttmodels} = this
    ttmodels.clear()

    const {tooltips} = this.model
    if (tooltips == null)
      return

    const {computed_renderers} = this
    for (const r of this.computed_renderers) {
      const tooltip = new Tooltip({
        custom: isString(tooltips) || isFunction(tooltips),
        attachment: this.model.attachment,
        show_arrow: this.model.show_arrow,
      })

      if (r instanceof GlyphRenderer) {
        ttmodels.set(r, tooltip)
      } else if (r instanceof GraphRenderer) {
        ttmodels.set(r.node_renderer, tooltip)
        ttmodels.set(r.edge_renderer, tooltip)
      }
    }

    const views = await build_views(this._ttviews, [...ttmodels.values()], {parent: this.plot_view})
    for (const ttview of views) {
      ttview.render()
    }

    const glyph_renderers = [...(function* () {
      for (const r of computed_renderers) {
        if (r instanceof GlyphRenderer)
          yield r
        else if (r instanceof GraphRenderer) {
          yield r.node_renderer
          yield r.edge_renderer
        }
      }
    })()]

    const slot = this._slots.get(this._update)
    if (slot != null) {
      const except = new Set(glyph_renderers.map((r) => r.data_source))
      Signal.disconnect_receiver(this, slot, except)
    }

    for (const r of glyph_renderers) {
      this.connect(r.data_source.inspect, this._update)
    }
  }

  get computed_renderers(): DataRenderer[] {
    const {renderers} = this.model
    const all_renderers = this.plot_model.data_renderers
    return compute_renderers(renderers, all_renderers)
  }

  get ttmodels(): Map<GlyphRenderer, Tooltip> {
    return this._ttmodels
  }

  _clear(): void {
    this._inspect(Infinity, Infinity)

    for (const [, tooltip] of this.ttmodels) {
      tooltip.clear()
    }
  }

  override _move(ev: MoveEvent): void {
    if (!this.model.active)
      return
    const {sx, sy} = ev
    if (!this.plot_view.frame.bbox.contains(sx, sy))
      this._clear()
    else
      this._inspect(sx, sy)
  }

  override _move_exit(): void {
    this._clear()
  }

  _inspect(sx: number, sy: number): void {
    let geometry: PointGeometry | SpanGeometry
    if (this.model.mode == "mouse")
      geometry = {type: "point", sx, sy}
    else {
      const direction = this.model.mode == "vline" ? "h" : "v"
      geometry = {type: "span", direction, sx, sy}
    }

    for (const r of this.computed_renderers) {
      const sm = r.get_selection_manager()
      const rview = this.plot_view.renderer_view(r)
      if (rview != null)
        sm.inspect(rview, geometry)
    }

    this._emit_callback(geometry)
  }

  _update([renderer, {geometry}]: [GlyphRenderer, {geometry: Geometry}]): void {
    if (!this.model.active)
      return

    if (!(geometry.type == "point" || geometry.type == "span"))
      return

    if (this.model.muted_policy == "ignore" && renderer.muted)
      return

    const tooltip = this.ttmodels.get(renderer)
    if (tooltip == null)
      return

    const selection_manager = renderer.get_selection_manager()

    const fullset_indices = selection_manager.inspectors.get(renderer)!
    const subset_indices = renderer.view.convert_selection_to_subset(fullset_indices)

    // XXX: https://github.com/bokeh/bokeh/pull/11992#pullrequestreview-897552484
    if (fullset_indices.is_empty() && fullset_indices.view == null) {
      tooltip.clear()
      return
    }

    const ds = selection_manager.source
    const renderer_view = this.plot_view.renderer_view(renderer)
    if (renderer_view == null)
      return

    const {sx, sy} = geometry
    const xscale = renderer_view.coordinates.x_scale
    const yscale = renderer_view.coordinates.y_scale
    const x = xscale.invert(sx)
    const y = yscale.invert(sy)

    const {glyph} = renderer_view

    const tooltips: [number, number, HTMLElement | null][] = []

    if (glyph instanceof PatchView) {
      const [tt_sx, tt_sy] = [sx, sy]
      const [tt_x, tt_y] = [x, y]
      const vars = {
        index: null,
        glyph, x, y, sx, sy, tt_x, tt_y, tt_sx, tt_sy,
        name: renderer.name,
      }
      const rendered = this._render_tooltips(ds, vars)
      tooltips.push([tt_sx, tt_sy, rendered])
    }

    if (glyph instanceof VAreaView || glyph instanceof HAreaView) {
      for (const i of subset_indices.line_indices) {
        const [tt_x, tt_y] = [x, y]
        const [tt_sx, tt_sy] = [sx, sy]
        const vars = {
          index: i,
          glyph, x, y, sx, sy, tt_x, tt_y, tt_sx, tt_sy,
          name: renderer.name,
          indices: subset_indices.line_indices,
        }
        const rendered = this._render_tooltips(ds, vars)
        tooltips.push([tt_sx, tt_sy, rendered])
      }
    }

    if (glyph instanceof LineView) {
      for (const i of subset_indices.line_indices) {
        let tt_x = glyph._x[i+1]
        let tt_y = glyph._y[i+1]
        let ii = i

        let tt_sx: number
        let tt_sy: number
        switch (this.model.line_policy) {
          case "interp": { // and renderer.get_interpolation_hit?
            [tt_x, tt_y] = glyph.get_interpolation_hit(i, geometry)
            tt_sx = xscale.compute(tt_x)
            tt_sy = yscale.compute(tt_y)
            break
          }
          case "prev": {
            [[tt_sx, tt_sy], ii] = _line_hit(glyph.sx, glyph.sy, i)
            break
          }
          case "next": {
            [[tt_sx, tt_sy], ii] = _line_hit(glyph.sx, glyph.sy, i+1)
            break
          }
          case "nearest": {
            [[tt_sx, tt_sy], ii] = _nearest_line_hit(i, geometry, sx, sy, glyph.sx, glyph.sy)
            tt_x = glyph._x[ii]
            tt_y = glyph._y[ii]
            break
          }
          default: {
            [tt_sx, tt_sy] = [sx, sy]
          }
        }

        const vars = {
          index: ii,
          glyph, x, y, sx, sy, tt_x, tt_y, tt_sx, tt_sy,
          name: renderer.name,
          indices: subset_indices.line_indices,
        }
        const rendered = this._render_tooltips(ds, vars)
        tooltips.push([tt_sx, tt_sy, rendered])
      }
    }

    for (const struct of fullset_indices.image_indices) {
      const [tt_sx, tt_sy] = [sx, sy]
      const [tt_x, tt_y] = [x, y]
      const vars = {
        index: struct.index,
        glyph, x, y, sx, sy, tt_x, tt_y, tt_sx, tt_sy,
        name: renderer.name,
      }
      const rendered = this._render_tooltips(ds, vars)
      tooltips.push([tt_sx, tt_sy, rendered])
    }

    for (const i of subset_indices.indices) {
      // multiglyphs set additional indices, e.g. multiline_indices for different tooltips
      if (glyph instanceof MultiLineView && !is_empty(subset_indices.multiline_indices)) {
        for (const j of subset_indices.multiline_indices[i.toString()]) { // TODO: subset_indices.multiline_indices.get(i)
          let tt_x = glyph._xs.get(i)[j]
          let tt_y = glyph._ys.get(i)[j]
          let jj = j

          let tt_sx: number
          let tt_sy: number
          switch (this.model.line_policy) {
            case "interp": { // and renderer.get_interpolation_hit?
              [tt_x, tt_y] = glyph.get_interpolation_hit(i, j, geometry)
              tt_sx = xscale.compute(tt_x)
              tt_sy = yscale.compute(tt_y)
              break
            }
            case "prev": {
              [[tt_sx, tt_sy], jj] = _line_hit(glyph.sxs.get(i), glyph.sys.get(i), j)
              break
            }
            case "next": {
              [[tt_sx, tt_sy], jj] = _line_hit(glyph.sxs.get(i), glyph.sys.get(i), j+1)
              break
            }
            case "nearest": {
              [[tt_sx, tt_sy], jj] = _nearest_line_hit(j, geometry, sx, sy, glyph.sxs.get(i), glyph.sys.get(i))
              tt_x = glyph._xs.get(i)[jj]
              tt_y = glyph._ys.get(i)[jj]
              break
            }
            default:
              throw new Error("shouldn't have happened")
          }

          const index = renderer.view.convert_indices_from_subset([i])[0]

          const vars = {
            index,
            glyph, x, y, sx, sy, tt_x, tt_y, tt_sx, tt_sy,
            name: renderer.name,
            indices: subset_indices.multiline_indices,
            segment_index: jj,
          }
          const rendered = this._render_tooltips(ds, vars)
          tooltips.push([tt_sx, tt_sy, rendered])
        }
      } else {
        // handle non-multiglyphs
        const tt_x = (glyph as any)._x?.[i]
        const tt_y = (glyph as any)._y?.[i]

        let tt_sx: number
        let tt_sy: number
        if (this.model.point_policy == "snap_to_data") { // and renderer.glyph.sx? and renderer.glyph.sy?
          // Pass in our screen position so we can determine which patch we're
          // over if there are discontinuous patches.
          let pt = glyph.get_anchor_point(this.model.anchor, i, [sx, sy])
          if (pt == null) {
            pt = glyph.get_anchor_point("center", i, [sx, sy])
            if (pt == null)
              continue // TODO?
          }

          tt_sx = pt.x
          tt_sy = pt.y
        } else
          [tt_sx, tt_sy] = [sx, sy]

        const index = renderer.view.convert_indices_from_subset([i])[0]

        const vars = {
          index,
          glyph, x, y, sx, sy, tt_x, tt_y, tt_sx, tt_sy,
          name: renderer.name,
          indices: subset_indices.indices,
        }
        const rendered = this._render_tooltips(ds, vars)
        tooltips.push([tt_sx, tt_sy, rendered])
      }
    }

    if (tooltips.length == 0)
      tooltip.clear()
    else {
      const {content} = tooltip
      empty(tooltip.content)
      for (const [,, node] of tooltips) {
        if (node != null)
          content.appendChild(node)
      }

      const [x, y] = tooltips[tooltips.length-1]
      tooltip.setv({position: [x, y]}, {check_eq: false}) // XXX: force update
    }
  }

  _emit_callback(geometry: PointGeometry | SpanGeometry): void {
    const {callback} = this.model
    if (callback == null)
      return

    for (const renderer of this.computed_renderers) {
      if (!(renderer instanceof GlyphRenderer))
        continue

      const glyph_renderer_view = this.plot_view.renderer_view(renderer)
      if (glyph_renderer_view == null)
        continue

      const {x_scale, y_scale} = glyph_renderer_view.coordinates
      const x = x_scale.invert(geometry.sx)
      const y = y_scale.invert(geometry.sy)

      const index = renderer.data_source.inspected

      callback.execute(this.model, {
        geometry: {x, y, ...geometry},
        renderer,
        index,
      })
    }
  }

  _create_template(tooltips: [string, string][]): HTMLElement {
    const rows = div({style: {display: "table", borderSpacing: "2px"}})

    for (const [label] of tooltips) {
      const row = div({style: {display: "table-row"}})
      rows.appendChild(row)

      const label_cell = div({style: {display: "table-cell"}, class: styles.tooltip_row_label}, label.length != 0 ? `${label}: ` : "")
      row.appendChild(label_cell)

      const value_el = span()
      value_el.dataset.value = ""

      const swatch_el = span({class: styles.tooltip_color_block}, " ")
      swatch_el.dataset.swatch = ""
      undisplay(swatch_el)

      const value_cell = div({style: {display: "table-cell"}, class: styles.tooltip_row_value}, value_el, swatch_el)
      row.appendChild(value_cell)
    }

    return rows
  }

  _render_template(template: HTMLElement, tooltips: [string, string][], ds: ColumnarDataSource, vars: TooltipVars): HTMLElement {
    const el = template.cloneNode(true) as HTMLElement

    const i = vars.index

    const value_els = el.querySelectorAll<HTMLElement>("[data-value]")
    const swatch_els = el.querySelectorAll<HTMLElement>("[data-swatch]")

    const color_re = /\$color(\[.*\])?:(\w*)/
    const swatch_re = /\$swatch:(\w*)/

    for (const [[, value], j] of enumerate(tooltips)) {
      const swatch_match = value.match(swatch_re)
      const color_match = value.match(color_re)

      if (swatch_match == null && color_match == null) {
        const content = replace_placeholders(value.replace("$~", "$data_"), ds, i, this.model.formatters, vars)
        if (isString(content)) {
          value_els[j].textContent = content
        } else {
          for (const el of content) {
            value_els[j].appendChild(el)
          }
        }
        continue
      }

      if (swatch_match != null) {
        const [, colname] = swatch_match
        const column = ds.get_column(colname)

        if (column == null) {
          value_els[j].textContent = `${colname} unknown`
        } else {
          const color = isNumber(i) ? column[i] : null

          if (color != null) {
            swatch_els[j].style.backgroundColor = color2css(color)
            display(swatch_els[j])
          }
        }
      }

      if (color_match != null) {
        const [, opts = "", colname] = color_match
        const column = ds.get_column(colname) // XXX: change to columnar ds
        if (column == null) {
          value_els[j].textContent = `${colname} unknown`
          continue
        }
        const hex = opts.indexOf("hex") >= 0
        const swatch = opts.indexOf("swatch") >= 0
        const color: Color | null = isNumber(i) ? column[i] : null
        if (color == null) {
          value_els[j].textContent = "(null)"
          continue
        }
        value_els[j].textContent = hex ? color2hex(color) : color2css(color) // TODO: color2pretty
        if (swatch) {
          swatch_els[j].style.backgroundColor = color2css(color)
          display(swatch_els[j])
        }
      }

    }

    return el
  }

  _render_tooltips(ds: ColumnarDataSource, vars: TooltipVars): HTMLElement | null {
    const {tooltips} = this.model
    const i = vars.index
    if (isString(tooltips)) {
      const content = replace_placeholders({html: tooltips}, ds, i, this.model.formatters, vars)
      return div(content)
    }

    if (isFunction(tooltips))
      return tooltips(ds, vars)

    if (tooltips instanceof Template) {
      this._template_view!.update(ds, i, vars)
      return this._template_view!.el
    }

    if (tooltips != null) {
      const template = this._template_el ?? (this._template_el = this._create_template(tooltips))
      return this._render_template(template, tooltips, ds, vars)
    }

    return null
  }
}

export namespace HoverTool {
  export type Attrs = p.AttrsOf<Props>

  export type Props = InspectTool.Props & {
    tooltips: p.Property<null | Template | string | [string, string][] | ((source: ColumnarDataSource, vars: TooltipVars) => HTMLElement)>
    formatters: p.Property<Formatters>
    renderers: p.Property<DataRenderer[] | "auto">
    mode: p.Property<HoverMode>
    muted_policy: p.Property<MutedPolicy>
    point_policy: p.Property<PointPolicy>
    line_policy: p.Property<LinePolicy>
    show_arrow: p.Property<boolean>
    anchor: p.Property<Anchor>
    attachment: p.Property<TooltipAttachment>
    callback: p.Property<CallbackLike1<HoverTool, {geometry: GeometryData, renderer: Renderer, index: Selection}> | null>
  }
}

export interface HoverTool extends HoverTool.Attrs {}

export class HoverTool extends InspectTool {
  override properties: HoverTool.Props
  override __view_type__: HoverToolView

  constructor(attrs?: Partial<HoverTool.Attrs>) {
    super(attrs)
  }

  static {
    this.prototype.default_view = HoverToolView

    this.define<HoverTool.Props>(({Any, Boolean, String, Array, Tuple, Dict, Or, Ref, Function, Auto, Nullable}) => ({
      tooltips: [ Nullable(Or(Ref(Template), String, Array(Tuple(String, String)), Function<[ColumnarDataSource, TooltipVars], HTMLElement>())), [
        ["index",         "$index"    ],
        ["data (x, y)",   "($x, $y)"  ],
        ["screen (x, y)", "($sx, $sy)"],
      ]],
      formatters:   [ Dict(Or(Ref(CustomJSHover), FormatterType)), {} ],
      renderers:    [ Or(Array(Ref(DataRenderer)), Auto), "auto" ],
      mode:         [ HoverMode, "mouse" ],
      muted_policy: [ MutedPolicy, "show" ],
      point_policy: [ PointPolicy, "snap_to_data" ],
      line_policy:  [ LinePolicy, "nearest" ],
      show_arrow:   [ Boolean, true ],
      anchor:       [ Anchor, "center" ],
      attachment:   [ TooltipAttachment, "horizontal" ],
      callback:     [ Nullable(Any /*TODO*/), null ],
    }))

    this.register_alias("hover", () => new HoverTool())
  }

  override tool_name = "Hover"
  override tool_icon = tool_icon_hover
}
