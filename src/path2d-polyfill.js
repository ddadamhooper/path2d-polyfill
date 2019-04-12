import parsePath from './parse-path';

/**
 * Work around for https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/8438884/
 * @ignore
 */
function supportsSvgPathArgument(window) {
  const canvas = window.document.createElement('canvas');
  const g = canvas.getContext('2d');
  const p = new window.Path2D('M0 0 L1 1');
  g.strokeStyle = 'red';
  g.lineWidth = 1;
  g.stroke(p);
  const imgData = g.getImageData(0, 0, 1, 1);
  return imgData.data[0] === 255; // Check if pixel is red
}

function rotatePoint(point, angle) {
  const nx = (point.x * Math.cos(angle)) - (point.y * Math.sin(angle));
  const ny = (point.y * Math.cos(angle)) + (point.x * Math.sin(angle));
  point.x = nx;
  point.y = ny;
}

function translatePoint(point, dx, dy) {
  point.x += dx;
  point.y += dy;
}

function scalePoint(point, s) {
  point.x *= s;
  point.y *= s;
}

function polyFillPath2D(window) {
  if (typeof window === 'undefined' || !window.CanvasRenderingContext2D) {
    return;
  }
  if (window.Path2D && supportsSvgPathArgument(window)) {
    return;
  }

  /**
     * Crates a Path2D polyfill object
     * @constructor
     * @ignore
     * @param {String} path
     */
  class Path2D {
    constructor(path) {
      this.segments = [];
      if (path && path instanceof Path2D) {
        this.segments.push(...path.segments);
      } else if (path) {
        this.segments = parsePath(path);
      }
    }

    addPath(path) {
      if (path && path instanceof Path2D) {
        this.segments.push(...path.segments);
      }
    }

    moveTo(x, y) {
      this.segments.push(['M', x, y]);
    }

    lineTo(x, y) {
      this.segments.push(['L', x, y]);
    }

    arc(x, y, r, start, end, ccw) {
      this.segments.push(['AC', x, y, r, start, end, !!ccw]);
    }

    arcTo(x1, y1, x2, y2, r) {
      this.segments.push(['AT', x1, y1, x2, y2, r]);
    }

    ellipse(x, y, rx, ry, angle, start, end, ccw) {
      this.segments.push(['E', x, y, rx, ry, angle, start, end, !!ccw]);
    }

    closePath() {
      this.segments.push(['Z']);
    }

    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
      this.segments.push(['C', cp1x, cp1y, cp2x, cp2y, x, y]);
    }

    quadraticCurveTo(cpx, cpy, x, y) {
      this.segments.push(['Q', cpx, cpy, x, y]);
    }

    rect(x, y, width, height) {
      this.segments.push(['R', x, y, width, height]);
    }
  }

  const cFill = window.CanvasRenderingContext2D.prototype.fill;
  const cStroke = window.CanvasRenderingContext2D.prototype.stroke;

  function buildPath(canvas, segments) {
    let endAngle;
    let startAngle;
    let largeArcFlag;
    let sweepFlag;
    let endPoint;
    let midPoint;
    let angle;
    let lambda;
    let t1;
    let t2;
    let x;
    let x1;
    let y;
    let y1;
    let r;
    let r1;
    let w;
    let h;
    let pathType;
    let centerPoint;
    let cpx;
    let cpy;
    let qcpx;
    let qcpy;
    let ccw;
    let startPoint = { x: 0, y: 0 };
    const currentPoint = { x: 0, y: 0 };

    canvas.beginPath();
    for (let i = 0; i < segments.length; ++i) {
      const s = segments[i];
      pathType = s[0];

      // Reset control point if command is not cubic
      if (pathType !== 'S' && pathType !== 's' && pathType !== 'C' && pathType !== 'c') {
        cpx = null;
        cpy = null;
      }

      if (pathType !== 'T' && pathType !== 't' && pathType !== 'Q' && pathType !== 'q') {
        qcpx = null;
        qcpy = null;
      }

      switch (pathType) {
        case 'm':
        case 'M':
          if (pathType === 'm') {
            x += s[1];
            y += s[2];
          } else {
            x = s[1];
            y = s[2];
          }

          if (pathType === 'M' || !startPoint) {
            startPoint = { x, y };
          }

          canvas.moveTo(x, y);
          break;
        case 'l':
          x += s[1];
          y += s[2];
          canvas.lineTo(x, y);
          break;
        case 'L':
          x = s[1];
          y = s[2];
          canvas.lineTo(x, y);
          break;
        case 'H':
          x = s[1];
          canvas.lineTo(x, y);
          break;
        case 'h':
          x += s[1];
          canvas.lineTo(x, y);
          break;
        case 'V':
          y = s[1];
          canvas.lineTo(x, y);
          break;
        case 'v':
          y += s[1];
          canvas.lineTo(x, y);
          break;
        case 'a':
        case 'A':
          if (pathType === 'a') {
            x += s[6];
            y += s[7];
          } else {
            x = s[6];
            y = s[7];
          }

          r = s[1]; // rx
          r1 = s[2]; // ry
          angle = (s[3] * Math.PI) / 180;
          largeArcFlag = !!s[4];
          sweepFlag = !!s[5];
          endPoint = { x, y };

          // https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes

          midPoint = {
            x: (currentPoint.x - endPoint.x) / 2,
            y: (currentPoint.y - endPoint.y) / 2,
          };
          rotatePoint(midPoint, -angle);

          // radius correction
          lambda = ((midPoint.x * midPoint.x) / (r * r))
                 + ((midPoint.y * midPoint.y) / (r1 * r1));
          if (lambda > 1) {
            lambda = Math.sqrt(lambda);
            r *= lambda;
            r1 *= lambda;
          }

          centerPoint = {
            x: (r * midPoint.y) / r1,
            y: -(r1 * midPoint.x) / r,
          };
          t1 = r * r * r1 * r1;
          t2 = (r * r * midPoint.y * midPoint.y)
             + (r1 * r1 * midPoint.x * midPoint.x);
          if (sweepFlag !== largeArcFlag) {
            scalePoint(centerPoint, Math.sqrt((t1 - t2) / t2) || 0);
          } else {
            scalePoint(centerPoint, -Math.sqrt((t1 - t2) / t2) || 0);
          }

          startAngle = Math.atan2(
            (midPoint.y - centerPoint.y) / r1,
            (midPoint.x - centerPoint.x) / r,
          );
          endAngle = Math.atan2(
            -(midPoint.y + centerPoint.y) / r1,
            -(midPoint.x + centerPoint.x) / r,
          );

          rotatePoint(centerPoint, angle);
          translatePoint(
            centerPoint,
            (endPoint.x + currentPoint.x) / 2,
            (endPoint.y + currentPoint.y) / 2,
          );

          canvas.save();
          canvas.translate(centerPoint.x, centerPoint.y);
          canvas.rotate(angle);
          canvas.scale(r, r1);
          canvas.arc(0, 0, 1, startAngle, endAngle, !sweepFlag);
          canvas.restore();
          break;
        case 'C':
          cpx = s[3]; // Last control point
          cpy = s[4];
          x = s[5];
          y = s[6];
          canvas.bezierCurveTo(s[1], s[2], cpx, cpy, x, y);
          break;
        case 'c':
          canvas.bezierCurveTo(
            s[1] + x,
            s[2] + y,
            s[3] + x,
            s[4] + y,
            s[5] + x,
            s[6] + y,
          );
          cpx = s[3] + x; // Last control point
          cpy = s[4] + y;
          x += s[5];
          y += s[6];
          break;
        case 'S':
          if (cpx === null || cpx === null) {
            cpx = x;
            cpy = y;
          }

          canvas.bezierCurveTo(
            (2 * x) - cpx,
            (2 * y) - cpy,
            s[1],
            s[2],
            s[3],
            s[4],
          );
          cpx = s[1]; // last control point
          cpy = s[2];
          x = s[3];
          y = s[4];
          break;
        case 's':
          if (cpx === null || cpx === null) {
            cpx = x;
            cpy = y;
          }

          canvas.bezierCurveTo(
            (2 * x) - cpx,
            (2 * y) - cpy,
            s[1] + x,
            s[2] + y,
            s[3] + x,
            s[4] + y,
          );
          cpx = s[1] + x; // last control point
          cpy = s[2] + y;
          x += s[3];
          y += s[4];
          break;
        case 'Q':
          qcpx = s[1]; // last control point
          qcpy = s[2];
          x = s[3];
          y = s[4];
          canvas.quadraticCurveTo(qcpx, qcpy, x, y);
          break;
        case 'q':
          qcpx = s[1] + x; // last control point
          qcpy = s[2] + y;
          x += s[3];
          y += s[4];
          canvas.quadraticCurveTo(qcpx, qcpy, x, y);
          break;
        case 'T':
          if (qcpx === null || qcpx === null) {
            qcpx = x;
            qcpy = y;
          }
          qcpx = (2 * x) - qcpx; // last control point
          qcpy = (2 * y) - qcpy;
          x = s[1];
          y = s[2];
          canvas.quadraticCurveTo(qcpx, qcpy, x, y);
          break;
        case 't':
          if (qcpx === null || qcpx === null) {
            qcpx = x;
            qcpy = y;
          }
          qcpx = (2 * x) - qcpx; // last control point
          qcpy = (2 * y) - qcpy;
          x += s[1];
          y += s[2];
          canvas.quadraticCurveTo(qcpx, qcpy, x, y);
          break;
        case 'z':
        case 'Z':
          x = startPoint.x;
          y = startPoint.y;
          startPoint = undefined;
          canvas.closePath();
          break;
        case 'AC': // arc
          x = s[1];
          y = s[2];
          r = s[3];
          startAngle = s[4];
          endAngle = s[5];
          ccw = s[6];
          canvas.arc(x, y, r, startAngle, endAngle, ccw);
          break;
        case 'AT': // arcTo
          x1 = s[1];
          y1 = s[2];
          x = s[3];
          y = s[4];
          r = s[5];
          canvas.arcTo(x1, y1, x, y, r);
          break;
        case 'E': // ellipse
          x = s[1];
          y = s[2];
          r = s[3];
          r1 = s[4];
          angle = s[5];
          startAngle = s[6];
          endAngle = s[7];
          ccw = s[8];
          canvas.save();
          canvas.translate(x, y);
          canvas.rotate(angle);
          canvas.scale(r, r1);
          canvas.arc(0, 0, 1, startAngle, endAngle, ccw);
          canvas.restore();
          break;
        case 'R': // rect
          x = s[1];
          y = s[2];
          w = s[3];
          h = s[4];
          startPoint = { x, y };
          canvas.rect(x, y, w, h);
          break;
        default:
          // throw new Error(`${pathType} is not implemented`); ?
      }

      currentPoint.x = x;
      currentPoint.y = y;
    }
  }

  window.CanvasRenderingContext2D.prototype.fill = function fill(...args) {
    let fillRule = 'nonzero';
    if (args.length === 0 || (args.length === 1 && typeof args[0] === 'string')) {
      cFill.apply(this, args);
      return;
    }
    if (arguments.length === 2) {
      fillRule = args[1];
    }
    const path = args[0];
    buildPath(this, path.segments);
    cFill.call(this, fillRule);
  };

  window.CanvasRenderingContext2D.prototype.stroke = function stroke(path) {
    if (!path) {
      cStroke.call(this);
      return;
    }
    buildPath(this, path.segments);
    cStroke.call(this);
  };

  window.Path2D = Path2D;
}

export default polyFillPath2D;
