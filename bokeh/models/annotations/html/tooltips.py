#-----------------------------------------------------------------------------
# Copyright (c) 2012 - 2022, Anaconda, Inc., and Bokeh Contributors.
# All rights reserved.
#
# The full license is in the file LICENSE.txt, distributed with this software.
#-----------------------------------------------------------------------------
'''

'''
#-----------------------------------------------------------------------------
# Boilerplate
#-----------------------------------------------------------------------------
from __future__ import annotations

import logging # isort:skip
log = logging.getLogger(__name__)

#-----------------------------------------------------------------------------
# Imports
#-----------------------------------------------------------------------------

# Bokeh imports
from ....core.enums import Anchor, TooltipAttachment
from ....core.properties import (
    Bool,
    Either,
    Enum,
    Float,
    NonNullable as Required,
    Nullable,
    Override,
    String,
    Tuple,
)
from .html_annotation import HTMLAnnotation

#-----------------------------------------------------------------------------
# Globals and constants
#-----------------------------------------------------------------------------

__all__ = (
    "Tooltip",
)

#-----------------------------------------------------------------------------
# General API
#-----------------------------------------------------------------------------

class Tooltip(HTMLAnnotation):
    ''' Render a tooltip.

    .. note::
        This model is currently managed by BokehJS and is not useful
        directly from python.

    '''

    # explicit __init__ to support Init signatures
    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)

    level = Override(default="overlay")

    position = Nullable(Either(Enum(Anchor), Tuple(Float, Float)), default=None, help="""
    The position of the tooltip with respect to its parent. It can be
    an absolute position within the parent or an anchor point for
    symbolic positioning.
    """)

    content = Required(String, help="""
    Rich HTML contents of this tooltip.
    """)

    attachment = Enum(TooltipAttachment, help="""
    Whether the tooltip should be displayed to the left or right of the cursor
    position or above or below it, or if it should be automatically placed
    in the horizontal or vertical dimension.
    """)

    show_arrow = Bool(default=True, help="""
    Whether tooltip's arrow should be shown.
    """)

    closable = Bool(default=False, help="""
    Allows to hide dismiss tooltip by clicking close (x) button. Useful when
    using this model for persistent tooltips.
    """)

#-----------------------------------------------------------------------------
# Dev API
#-----------------------------------------------------------------------------

#-----------------------------------------------------------------------------
# Private API
#-----------------------------------------------------------------------------

#-----------------------------------------------------------------------------
# Code
#-----------------------------------------------------------------------------
