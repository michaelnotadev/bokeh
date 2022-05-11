import {LayoutDOM, LayoutDOMView} from "../layouts/layout_dom"
import {ToolbarBox, ToolbarBoxView} from "../tools/toolbar_box"
import {GridBox, GridBoxView} from "../layouts/grid_box"
import {Toolbar} from "../tools/toolbar"
import {RowsSizing, ColsSizing} from "core/layout/grid"
import {Location} from "core/enums"
import * as p from "core/properties"

export class GridPlotView extends LayoutDOMView {
  override model: GridPlot

  protected _toolbar: ToolbarBox
  protected _grid: GridBox

  protected get _toolbar_view(): ToolbarBoxView {
    return this.child_views[0] as ToolbarBoxView
  }

  protected get _grid_view(): GridBoxView {
    return this.child_views[1] as GridBoxView
  }

  override initialize(): void {
    super.initialize()

    const {toolbar, toolbar_location} = this.model
    this._toolbar = new ToolbarBox({toolbar, toolbar_location: toolbar_location ?? "above"})

    const {children, rows, cols, spacing} = this.model
    this._grid = new GridBox({children, rows, cols, spacing})
  }

  override connect_signals(): void {
    super.connect_signals()
    const {toolbar, toolbar_location, children, rows, cols, spacing} = this.model.properties
    this.on_change(toolbar_location, () => {
      const {toolbar_location} = this.model
      this._toolbar.toolbar_location = toolbar_location ?? "above"
    })
    this.on_change([toolbar, toolbar_location, children, rows, cols, spacing], () => {
      this.rebuild()
    })
  }

  get child_models(): LayoutDOM[] {
    return [this._toolbar, this._grid]
  }

  override _update_layout(): void {
    super._update_layout()

    const {style} = this.el
    style.display = "flex"

    const {toolbar_location} = this.model
    const direction = (() => {
      switch (toolbar_location) {
        case "above": return "column"
        case "below": return "column-reverse"
        case "left":  return "row"
        case "right": return "row-reverse"
        case null:    return "row"
      }
    })()
    style.flexDirection = direction
  }
}

export namespace GridPlot {
  export type Attrs = p.AttrsOf<Props>

  export type Props = LayoutDOM.Props & {
    toolbar: p.Property<Toolbar>
    toolbar_location: p.Property<Location | null>
    children: p.Property<[LayoutDOM, number, number, number?, number?][]>
    rows: p.Property<RowsSizing>
    cols: p.Property<ColsSizing>
    spacing: p.Property<number | [number, number]>
  }
}

export interface GridPlot extends GridPlot.Attrs {}

export class GridPlot extends LayoutDOM {
  override properties: GridPlot.Props
  override __view_type__: GridPlotView

  constructor(attrs?: Partial<GridPlot.Attrs>) {
    super(attrs)
  }

  static {
    this.prototype.default_view = GridPlotView

    this.define<GridPlot.Props>(({Any, Int, Number, Tuple, Array, Ref, Or, Opt, Nullable}) => ({
      toolbar:          [ Ref(Toolbar), () => new Toolbar() ],
      toolbar_location: [ Nullable(Location), "above" ],
      children:         [ Array(Tuple(Ref(LayoutDOM), Int, Int, Opt(Int), Opt(Int))), [] ],
      rows:             [ Any /*TODO*/, "auto" ],
      cols:             [ Any /*TODO*/, "auto" ],
      spacing:          [ Or(Number, Tuple(Number, Number)), 0 ],
    }))
  }
}
