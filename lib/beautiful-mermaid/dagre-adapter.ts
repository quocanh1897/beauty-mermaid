// ============================================================================
// Dagre layout adapter — shared utilities for @dagrejs/dagre integration
//
// Provides:
//   1. snapToOrthogonal()       — post-processes edge points into 90-degree segments
//   2. centerToTopLeft()        — converts dagre's center-based coords to top-left
//   3. clipToDiamondBoundary()  — projects rectangle-boundary points onto the diamond
//   4. clipEndpointsToNodes()   — fixes endpoints after orthogonalization
//
// Dagre outputs node positions as center coordinates and edge points that
// may not be strictly orthogonal. These helpers bridge the gap so our SVG
// renderers receive the same top-left coords and orthogonal edge paths
// they previously got from ELK.
// ============================================================================

import type { Point } from './types.ts'

/**
 * Convert dagre's center-based node coordinates to top-left origin.
 * Dagre returns (x, y) as the center of the node bounding box.
 * Our renderers expect top-left coordinates.
 */
export function centerToTopLeft(cx: number, cy: number, width: number, height: number): Point {
  return { x: cx - width / 2, y: cy - height / 2 }
}

/**
 * Project a point from the rectangular bounding box onto the diamond boundary.
 *
 * Dagre treats all nodes as rectangles, so edge connection points land on the
 * rectangle boundary. For diamond shapes (rotated squares), the actual visual
 * boundary is an inscribed diamond whose vertices touch the rectangle's edge
 * midpoints. At non-cardinal angles, the rectangle boundary is *outside* the
 * diamond — making edges appear to float in the air.
 *
 * Math: the diamond boundary satisfies |dx|/hw + |dy|/hh = 1 where (dx,dy) is
 * the offset from center and (hw,hh) are half-width/height. We scale the
 * direction vector so it lands exactly on this boundary.
 */
export function clipToDiamondBoundary(
  point: Point,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
): Point {
  const dx = point.x - cx
  const dy = point.y - cy
  // Point is at (or very near) center — nothing to clip
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return point
  // Scale the direction vector to land on the diamond boundary
  const scale = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh)
  return { x: cx + scale * dx, y: cy + scale * dy }
}

/**
 * Project a point from the rectangular bounding box onto the circle boundary.
 *
 * Dagre treats all nodes as rectangles, so edge connection points land on the
 * rectangle boundary. For circular shapes (circle, doublecircle, state-start,
 * state-end), the actual visual boundary is inscribed within the rectangle.
 * At non-cardinal angles, the rectangle boundary is *outside* the circle —
 * making edges appear to float in the air.
 *
 * Math: scale the direction vector (from center to point) so its length equals
 * the circle radius.
 */
export function clipToCircleBoundary(
  point: Point,
  cx: number,
  cy: number,
  r: number,
): Point {
  const dx = point.x - cx
  const dy = point.y - cy
  const dist = Math.sqrt(dx * dx + dy * dy)
  // Point is at (or very near) center — nothing to clip
  if (dist < 0.5) return point
  const scale = r / dist
  return { x: cx + scale * dx, y: cy + scale * dy }
}

/**
 * Post-process dagre edge points into strictly orthogonal (90-degree) segments.
 *
 * Dagre's Sugiyama layout routes edges through intermediate dummy nodes at each
 * rank, so most segments are already axis-aligned. However, when source and target
 * are at different horizontal positions, diagonal segments can appear.
 *
 * Strategy: walk consecutive point pairs. If both x and y differ, insert an
 * intermediate bend point to create an L-shaped orthogonal path. The bend
 * direction depends on the layout axis:
 *   - verticalFirst=true  (TD/BT): drop vertically, then adjust sideways
 *   - verticalFirst=false (LR/RL): move sideways, then adjust vertically
 *
 * After orthogonalization, collinear points (three consecutive points on the
 * same axis) are eliminated to avoid redundant micro-segments.
 */
export function snapToOrthogonal(points: Point[], verticalFirst = true): Point[] {
  if (points.length < 2) return points

  const result: Point[] = [points[0]!]

  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1]!
    const curr = points[i]!

    const dx = Math.abs(curr.x - prev.x)
    const dy = Math.abs(curr.y - prev.y)

    // If already axis-aligned (or close enough), keep as-is
    if (dx < 1 || dy < 1) {
      result.push(curr)
      continue
    }

    // Insert an L-bend whose direction matches the layout flow.
    // TD/BT layouts: vertical first — edge drops along the rank axis, then adjusts.
    // LR/RL layouts: horizontal first — edge moves along the rank axis, then adjusts.
    if (verticalFirst) {
      result.push({ x: prev.x, y: curr.y })
    } else {
      result.push({ x: curr.x, y: prev.y })
    }
    result.push(curr)
  }

  // Eliminate collinear points — if three consecutive points share the same x
  // (vertical segment) or same y (horizontal segment), the middle point is
  // redundant and creates visual artifacts at polyline corners.
  return removeCollinear(result)
}

/** Remove middle points from three-in-a-row collinear sequences. */
function removeCollinear(pts: Point[]): Point[] {
  if (pts.length < 3) return pts
  const out: Point[] = [pts[0]!]
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1]!
    const b = pts[i]!
    const c = pts[i + 1]!
    // Skip b if a-b-c are all on the same horizontal or vertical line
    const sameX = Math.abs(a.x - b.x) < 1 && Math.abs(b.x - c.x) < 1
    const sameY = Math.abs(a.y - b.y) < 1 && Math.abs(b.y - c.y) < 1
    if (sameX || sameY) continue
    out.push(b)
  }
  out.push(pts[pts.length - 1]!)
  return out
}

/**
 * Node rectangle for endpoint clipping — uses dagre's center-based coordinates.
 */
export interface NodeRect {
  /** Center x (dagre coordinate) */
  cx: number
  /** Center y (dagre coordinate) */
  cy: number
  /** Half-width */
  hw: number
  /** Half-height */
  hh: number
}

/**
 * Clip edge endpoints to the correct side of rectangular node boundaries.
 *
 * After snapToOrthogonal(), the final/first segment direction may differ from
 * dagre's original boundary intersection direction. Dagre computes boundary
 * points based on the diagonal direction between nodes, but orthogonalization
 * converts the path to L-bends — changing the approach direction of the
 * first/last segment.
 *
 * Example: in a TB layout, dagre places the target endpoint at the TOP of a
 * node (correct for a diagonal approach). After snapToOrthogonal, the last
 * segment becomes horizontal — but the endpoint stays on the top edge. The
 * arrow visually enters the box from the side at the top, going "inside."
 *
 * This function corrects both endpoints so they connect to the side the edge
 * actually approaches from:
 *   - Horizontal last segment → endpoint on left/right side
 *   - Vertical last segment  → endpoint on top/bottom
 *   - Similarly for the first segment and source node
 *
 * When the edge path is within the node's bounds, connects at the natural
 * position to avoid unnecessary bends. Otherwise routes to node center.
 *
 * For 2-point edges (direct connections), clips based on the overall direction
 * between endpoints to ensure arrowheads render at node boundaries.
 */
export function clipEndpointsToNodes(
  points: Point[],
  sourceNode: NodeRect | null,
  targetNode: NodeRect | null,
): Point[] {
  if (points.length < 2) return points
  const result = points.map(p => ({ ...p }))

  // --- Fix target endpoint ---
  if (targetNode) {
    const last = result.length - 1

    if (points.length === 2) {
      // 2-point edge: clip based on overall direction between endpoints
      // This ensures arrowheads render at node boundaries, not inside nodes
      const first = result[0]!
      const curr = result[last]!
      const dx = Math.abs(curr.x - first.x)
      const dy = Math.abs(curr.y - first.y)

      if (dy >= dx) {
        // Primarily vertical — clip to top/bottom
        const approachFromTop = curr.y > first.y
        const sideY = approachFromTop
          ? targetNode.cy - targetNode.hh
          : targetNode.cy + targetNode.hh
        result[last] = { x: curr.x, y: sideY }
      } else {
        // Primarily horizontal — clip to left/right
        const approachFromLeft = curr.x > first.x
        const sideX = approachFromLeft
          ? targetNode.cx - targetNode.hw
          : targetNode.cx + targetNode.hw
        result[last] = { x: sideX, y: curr.y }
      }
    } else {
      // 3+ point edge: use last segment direction
      const prev = result[last - 1]!
      const curr = result[last]!

      // First check: if the endpoint is already at a node boundary (from the
      // L-bend created by orthogonalization), clip to THAT boundary rather than
      // re-routing to a different side. This prevents horizontal L-bend endpoints
      // from being moved to the side when they should stay at the top/bottom.
      const nodeTop = targetNode.cy - targetNode.hh
      const nodeBottom = targetNode.cy + targetNode.hh
      const nodeLeft = targetNode.cx - targetNode.hw
      const nodeRight = targetNode.cx + targetNode.hw
      const boundaryTol = 3

      const atTop = Math.abs(curr.y - nodeTop) < boundaryTol
      const atBottom = Math.abs(curr.y - nodeBottom) < boundaryTol
      const atLeft = Math.abs(curr.x - nodeLeft) < boundaryTol
      const atRight = Math.abs(curr.x - nodeRight) < boundaryTol

      if (atTop || atBottom) {
        // Endpoint is at top or bottom boundary — create vertical final approach.
        // The L-bend from orthogonalization may have placed multiple points at the
        // boundary y. Walk backward to find the last point NOT at the boundary,
        // adjust its x to match the endpoint, and remove intermediate points.
        const sideY = atTop ? nodeTop : nodeBottom
        const withinHorizontalBounds =
          curr.x >= nodeLeft && curr.x <= nodeRight
        const endX = withinHorizontalBounds ? curr.x : targetNode.cx

        // Find the furthest-back point that is still at the boundary y
        let truncateFrom = last
        for (let i = last - 1; i >= 0; i--) {
          if (Math.abs(result[i]!.y - sideY) < boundaryTol) {
            truncateFrom = i
          } else {
            break
          }
        }
        // Replace: set the point before the boundary as the bend, then straight down
        if (truncateFrom > 0) {
          result[truncateFrom] = { x: endX, y: result[truncateFrom - 1]!.y }
          result[truncateFrom + 1] = { x: endX, y: sideY }
          result.length = truncateFrom + 2
        } else {
          result[last] = { x: endX, y: sideY }
        }
      } else if (atLeft || atRight) {
        // Endpoint is at left or right boundary — create horizontal final approach.
        const sideX = atLeft ? nodeLeft : nodeRight
        const withinVerticalBounds =
          curr.y >= nodeTop && curr.y <= nodeBottom
        const endY = withinVerticalBounds ? curr.y : targetNode.cy

        let truncateFrom = last
        for (let i = last - 1; i >= 0; i--) {
          if (Math.abs(result[i]!.x - sideX) < boundaryTol) {
            truncateFrom = i
          } else {
            break
          }
        }
        if (truncateFrom > 0) {
          result[truncateFrom] = { x: result[truncateFrom - 1]!.x, y: endY }
          result[truncateFrom + 1] = { x: sideX, y: endY }
          result.length = truncateFrom + 2
        } else {
          result[last] = { x: sideX, y: endY }
        }
      } else {
        // Endpoint is not near a boundary — use segment direction
        const dx = Math.abs(curr.x - prev.x)
        const dy = Math.abs(curr.y - prev.y)

        const isStrictlyHorizontal = dy < 1 && dx >= 1
        const isStrictlyVertical = dx < 1 && dy >= 1

        if (isStrictlyHorizontal) {
          const approachFromLeft = curr.x > prev.x
          const sideX = approachFromLeft ? nodeLeft : nodeRight
          result[last] = { x: sideX, y: targetNode.cy }
          result[last - 1] = { ...prev, y: targetNode.cy }
        } else if (isStrictlyVertical) {
          const approachFromTop = curr.y > prev.y
          const sideY = approachFromTop ? nodeTop : nodeBottom
          result[last] = { x: targetNode.cx, y: sideY }
          result[last - 1] = { ...prev, x: targetNode.cx }
        } else if (dy < dx) {
          // Primarily horizontal
          const approachFromLeft = curr.x > prev.x
          const sideX = approachFromLeft ? nodeLeft : nodeRight
          const withinVerticalBounds = prev.y >= nodeTop && prev.y <= nodeBottom
          if (withinVerticalBounds) {
            result[last] = { x: sideX, y: prev.y }
          } else {
            result[last] = { x: sideX, y: targetNode.cy }
            result[last - 1] = { ...prev, y: targetNode.cy }
          }
        } else {
          // Primarily vertical
          const approachFromTop = curr.y > prev.y
          const sideY = approachFromTop ? nodeTop : nodeBottom
          const withinHorizontalBounds = prev.x >= nodeLeft && prev.x <= nodeRight
          if (withinHorizontalBounds) {
            result[last] = { x: prev.x, y: sideY }
          } else {
            result[last] = { x: targetNode.cx, y: sideY }
            result[last - 1] = { ...prev, x: targetNode.cx }
          }
        }
      }
    }
  }

  // --- Fix source endpoint (first segment) ---
  if (sourceNode && points.length >= 3) {
    const first = result[0]!
    const next = result[1]!

    // Same boundary-first approach as target endpoint
    const srcTop = sourceNode.cy - sourceNode.hh
    const srcBottom = sourceNode.cy + sourceNode.hh
    const srcLeft = sourceNode.cx - sourceNode.hw
    const srcRight = sourceNode.cx + sourceNode.hw
    const boundaryTol = 3

    const atTop = Math.abs(first.y - srcTop) < boundaryTol
    const atBottom = Math.abs(first.y - srcBottom) < boundaryTol
    const atLeft = Math.abs(first.x - srcLeft) < boundaryTol
    const atRight = Math.abs(first.x - srcRight) < boundaryTol

    if (atTop || atBottom) {
      const sideY = atTop ? srcTop : srcBottom
      const withinHorizontalBounds = first.x >= srcLeft && first.x <= srcRight
      const startX = withinHorizontalBounds ? first.x : sourceNode.cx

      let truncateTo = 0
      for (let i = 1; i < result.length; i++) {
        if (Math.abs(result[i]!.y - sideY) < boundaryTol) {
          truncateTo = i
        } else {
          break
        }
      }
      if (truncateTo < result.length - 1) {
        const afterY = result[truncateTo + 1]!.y
        const newPoints: Point[] = [
          { x: startX, y: sideY },
          { x: startX, y: afterY },
          ...result.slice(truncateTo + 1),
        ]
        result.length = 0
        result.push(...newPoints)
      } else {
        result[0] = { x: startX, y: sideY }
      }
    } else if (atLeft || atRight) {
      const sideX = atLeft ? srcLeft : srcRight
      const withinVerticalBounds = first.y >= srcTop && first.y <= srcBottom
      const startY = withinVerticalBounds ? first.y : sourceNode.cy

      let truncateTo = 0
      for (let i = 1; i < result.length; i++) {
        if (Math.abs(result[i]!.x - sideX) < boundaryTol) {
          truncateTo = i
        } else {
          break
        }
      }
      if (truncateTo < result.length - 1) {
        const afterX = result[truncateTo + 1]!.x
        const newPoints: Point[] = [
          { x: sideX, y: startY },
          { x: afterX, y: startY },
          ...result.slice(truncateTo + 1),
        ]
        result.length = 0
        result.push(...newPoints)
      } else {
        result[0] = { x: sideX, y: startY }
      }
    } else {
      const dx = Math.abs(next.x - first.x)
      const dy = Math.abs(next.y - first.y)
      const isStrictlyHorizontal = dy < 1 && dx >= 1
      const isStrictlyVertical = dx < 1 && dy >= 1

      if (isStrictlyHorizontal) {
        const exitToRight = next.x > first.x
        const sideX = exitToRight ? srcRight : srcLeft
        result[0] = { x: sideX, y: sourceNode.cy }
        result[1] = { ...result[1]!, y: sourceNode.cy }
      } else if (isStrictlyVertical) {
        const exitDownward = next.y > first.y
        const sideY = exitDownward ? srcBottom : srcTop
        result[0] = { x: sourceNode.cx, y: sideY }
        result[1] = { ...result[1]!, x: sourceNode.cx }
      } else if (dy < dx) {
        const exitToRight = next.x > first.x
        const sideX = exitToRight ? srcRight : srcLeft
        const withinVerticalBounds = next.y >= srcTop && next.y <= srcBottom
        if (withinVerticalBounds) {
          result[0] = { x: sideX, y: next.y }
        } else {
          result[0] = { x: sideX, y: sourceNode.cy }
          result[1] = { ...result[1]!, y: sourceNode.cy }
        }
      } else {
        const exitDownward = next.y > first.y
        const sideY = exitDownward ? srcBottom : srcTop
        const withinHorizontalBounds = next.x >= srcLeft && next.x <= srcRight
        if (withinHorizontalBounds) {
          result[0] = { x: next.x, y: sideY }
        } else {
          result[0] = { x: sourceNode.cx, y: sideY }
          result[1] = { ...result[1]!, x: sourceNode.cx }
        }
      }
    }
  }

  return removeBacktracking(result)
}

/**
 * Remove backtracking segments where the path reverses direction on the same axis.
 * E.g. going right then left then right again — the middle detour is removed.
 */
function removeBacktracking(points: Point[]): Point[] {
  if (points.length < 3) return points

  const out: Point[] = [points[0]!]

  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1]!
    const curr = points[i]!

    if (out.length < 2) {
      out.push(curr)
      continue
    }

    const prevPrev = out[out.length - 2]!

    // Check for horizontal backtrack: prevPrev→prev is horizontal, prev→curr reverses
    const h1 = Math.abs(prevPrev.y - prev.y) < 1 && Math.abs(prev.y - curr.y) < 1
    if (h1) {
      const dx1 = prev.x - prevPrev.x
      const dx2 = curr.x - prev.x
      if ((dx1 > 1 && dx2 < -1) || (dx1 < -1 && dx2 > 1)) {
        // Backtrack detected — replace prev with curr (skip the detour)
        out[out.length - 1] = curr
        continue
      }
    }

    // Check for vertical backtrack
    const v1 = Math.abs(prevPrev.x - prev.x) < 1 && Math.abs(prev.x - curr.x) < 1
    if (v1) {
      const dy1 = prev.y - prevPrev.y
      const dy2 = curr.y - prev.y
      if ((dy1 > 1 && dy2 < -1) || (dy1 < -1 && dy2 > 1)) {
        out[out.length - 1] = curr
        continue
      }
    }

    out.push(curr)
  }

  // Remove duplicate consecutive points
  const deduped: Point[] = [out[0]!]
  for (let i = 1; i < out.length; i++) {
    const prev = deduped[deduped.length - 1]!
    const curr = out[i]!
    if (Math.abs(prev.x - curr.x) > 0.5 || Math.abs(prev.y - curr.y) > 0.5) {
      deduped.push(curr)
    }
  }

  return deduped.length >= 2 ? deduped : out
}
