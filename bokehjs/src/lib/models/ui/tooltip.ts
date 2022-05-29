import {UIElement, UIElementView} from "./ui_element"
import {Anchor, VAlign, HAlign, TooltipAttachment} from "core/enums"
import {div, display, undisplay, bounding_box} from "core/dom"
import {DOMView} from "core/dom_view"
import {isString} from "core/util/types"
import * as p from "core/properties"

import tooltips_css, * as tooltips from "styles/tooltips.css"

const arrow_size = 10  // XXX: keep in sync with less

export class TooltipView extends UIElementView {
  override model: Tooltip
  override parent: DOMView

  protected content_el: HTMLElement

  override connect_signals(): void {
    super.connect_signals()

    const {content, target, position, visible} = this.model.properties
    this.on_change([content, target], () => this.render())
    this.on_change([position, visible], () => this._reposition())
  }

  override styles(): string[] {
    return [...super.styles(), tooltips_css]
  }

  get target(): Element {
    return this.model.target ?? (this.parent.el as any) // TODO: parent: DOMElementView from PR #11915
  }

  override render(): void {
    this.empty()

    const content = (() => {
      const {content} = this.model
      if (isString(content)) {
        const parser = new DOMParser()
        const document = parser.parseFromString(content, "text/html")
        return [...document.body.childNodes]
      } else
        return [content]
    })()

    this.content_el = div({class: "bk-tooltip-content"}, content)
    this.shadow_el.appendChild(this.content_el)
    this.el.classList.toggle(tooltips.tooltip_arrow, this.model.show_arrow)

    this.target.appendChild(this.el)
    this._reposition()
  }

  private _anchor_to_align(anchor: Anchor): [VAlign, HAlign] {
    switch (anchor) {
      case "top_left":
        return ["top", "left"]
      case "top":
      case "top_center":
        return ["top", "center"]
      case "top_right":
        return ["top", "right"]

      case "left":
      case "center_left":
        return ["center", "left"]
      case "center":
      case "center_center":
        return ["center", "center"]
      case "right":
      case "center_right":
        return ["center", "right"]

      case "bottom_left":
        return ["bottom", "left"]
      case "bottom":
      case "bottom_center":
        return ["bottom", "center"]
      case "bottom_right":
        return ["bottom", "right"]
    }
  }

  protected _reposition(): void {
    const {position, visible} = this.model
    if (position == null || !visible) {
      undisplay(this.el)
      return
    }

    display(this.el)  // XXX: {offset,client}Width() gives 0 when display="none"

    const bbox = bounding_box(this.target).relative()
    const [sx, sy] = (() => {
      if (isString(position)) {
        const [valign, halign] = this._anchor_to_align(position)
        const sx = (() => {
          switch (halign) {
            case "left": return bbox.left
            case "center": return bbox.hcenter
            case "right": return bbox.right
          }
        })()
        const sy = (() => {
          switch (valign) {
            case "top": return bbox.top
            case "center": return bbox.vcenter
            case "bottom": return bbox.bottom
          }
        })()
        return [sx, sy]
      } else
        return position
    })()

    const side = (() => {
      const {attachment} = this.model
      switch (attachment) {
        case "horizontal":
          return sx < bbox.hcenter ? "right" : "left"
        case "vertical":
          return sy < bbox.vcenter ? "below" : "above"
        default:
          return attachment
      }
    })()

    this.el.classList.remove(tooltips.right)
    this.el.classList.remove(tooltips.left)
    this.el.classList.remove(tooltips.above)
    this.el.classList.remove(tooltips.below)

    // slightly confusing: side "left" (for example) is relative to point that
    // is being annotated but CS class ".bk-left" is relative to the tooltip itself
    let top: number
    let left: number | null = null
    let right: number | null = null

    switch (side) {
      case "right":
        this.el.classList.add(tooltips.left)
        left = sx + (this.el.offsetWidth - this.el.clientWidth) + arrow_size
        top = sy - this.el.offsetHeight/2
        break
      case "left":
        this.el.classList.add(tooltips.right)
        right = (this.el.offsetWidth - sx) + arrow_size
        top = sy - this.el.offsetHeight/2
        break
      case "below":
        this.el.classList.add(tooltips.above)
        top = sy + (this.el.offsetHeight - this.el.clientHeight) + arrow_size
        left = Math.round(sx - this.el.offsetWidth/2)
        break
      case "above":
        this.el.classList.add(tooltips.below)
        top = sy - this.el.offsetHeight - arrow_size
        left = Math.round(sx - this.el.offsetWidth/2)
        break
    }

    this.el.style.top = `${top}px`
    this.el.style.left = left != null ? `${left}px` : ""
    this.el.style.right = right != null ? `${right}px` : ""
  }
}

export namespace Tooltip {
  export type Attrs = p.AttrsOf<Props>

  export type Props = UIElement.Props & {
    position: p.Property<Anchor | [number, number] | null>
    content: p.Property<string | Node>
    attachment: p.Property<TooltipAttachment>
    show_arrow: p.Property<boolean>
    closable: p.Property<boolean>
    /** @internal */
    target: p.Property<Node | null>
  }
}

export interface Tooltip extends Tooltip.Attrs {}

export class Tooltip extends UIElement {
  override properties: Tooltip.Props
  override __view_type__: TooltipView

  constructor(attrs?: Partial<Tooltip.Attrs>) {
    super(attrs)
  }

  static {
    this.prototype.default_view = TooltipView

    this.define<Tooltip.Props>(({Boolean, Number, String, Tuple, Or, Ref, Nullable}) => ({
      position: [ Nullable(Or(Anchor, Tuple(Number, Number))), null ],
      content: [ Or(String, Ref(Node)) ],
      attachment: [ TooltipAttachment, "horizontal" ],
      show_arrow: [ Boolean, true ],
      closable: [ Boolean, false ],
    }))

    this.internal<Tooltip.Props>(({Ref, Nullable}) => ({
      target: [ Nullable(Ref(Node)), null ],
    }))
  }

  clear(): void {
    this.position = null
  }
}
