/*
The MIT License (MIT)
 relatively minor changes by Terry Raymond 2017
 Copyright (c) 2016 Jesse Miller <jmiller@jmiller.com>
 Copyright (c) 2016 Alexey Korepanov <kaikaikai@yandex.ru>
 Copyright (c) 2016 Ermiya Eskandary & Théophile Cailliau and other contributors
 https://jmiller.mit-license.org/
*/
// ==UserScript==
// @name         Slither.io Bot Gen3
// @namespace    https://github.com/xanderak/Slither.io-bot
// @version      0.4
// @description  Slither.io Bot Gen3
// @author       Terry Raymond (https://github.com/xanderak)
// @match        http://slither.io/
// @updateURL    https://github.com/xanderak/Slither.io-bot/raw/master/bot.user.js
// @downloadURL  https://github.com/xanderak/Slither.io-bot/raw/master/bot.user.js
// @supportURL   https://github.com/xanderak/Slither.io-bot/issues
// @grant        none
// ==/UserScript==

/* todo:::
left & right detection circles (yellow warning, red can't turn)
straight -ish path detection (red, yelloow too?)
if left & right same snake, escape l/r

encircle escape - find unblocked path furthest from encircling snake head

gravity food

travelling salesman quick check for food

*/


var canvas = window.canvas = (function (window) {
    return {
        // Spoofs moving the mouse to the provided coordinates.
        setMouseCoordinates: function (point) {
            window.xm = point.x;
            window.ym = point.y;
        },

        // Convert map coordinates to mouse coordinates.
        mapToMouse: function (point) {
            var mouseX = (point.x - window.snake.xx) * window.gsc;
            var mouseY = (point.y - window.snake.yy) * window.gsc;
            return { x: mouseX, y: mouseY };
        },

        // Map cordinates to Canvas cordinate shortcut
        mapToCanvas: function (point) {
            var c = {
                x: window.mww2 + (point.x - window.view_xx) * window.gsc,
                y: window.mhh2 + (point.y - window.view_yy) * window.gsc
            };
            return c;
        },

        // Map to Canvas coordinate conversion for drawing circles.
        // Radius also needs to scale by .gsc
        circleMapToCanvas: function (circle) {
            var newCircle = canvas.mapToCanvas({ x: circle.x, y: circle.y });
            return canvas.circle( newCircle.x, newCircle.y, circle.radius * window.gsc);
        },

        // Constructor for point type
        point: function (x, y) {
            return { x: Math.round(x), y: Math.round(y) };
        },

        // Constructor for line type
        line: function (x1,y1,x2,y2) {
            return { x1:Math.round(x1), y1: Math.round(y1), x2:Math.round(x2), y2: Math.round(y2)};
        },

        // Constructor for rect type
        rect: function (x, y, w, h) {
            return {
                x: Math.round(x),
                y: Math.round(y),
                width: Math.round(w),
                height: Math.round(h)
            };
        },

        // Constructor for circle type
        circle: function (x, y, r) {
            return {
                x: Math.round(x),
                y: Math.round(y),
                radius: Math.round(r)
            };
        },

        // Fast atan2
        fastAtan2: function (y, x) {
            const QPI = Math.PI / 4;
            const TQPI = 3 * Math.PI / 4;
            var r = 0.0;
            var angle = 0.0;
            var abs_y = Math.abs(y) + 1e-10;
            if (x < 0) {
                r = (x + abs_y) / (abs_y - x);
                angle = TQPI;
            } else {
                r = (x - abs_y) / (x + abs_y);
                angle = QPI;
            }
            angle += (0.1963 * r * r - 0.9817) * r;
            if (y < 0) return -angle;

            return angle;
        },

        // Adjusts zoom in response to the mouse wheel.
        setZoom: function (e) {
            // Scaling ratio
            if (window.gsc) {
                window.gsc *= Math.pow(0.9, e.wheelDelta / -120 || e.detail / 2 || 0);
                window.desired_gsc = window.gsc;
            }
        },

        // Maintains Zoom
        maintainZoom: function () {
            if (window.desired_gsc !== undefined)
                window.gsc = window.desired_gsc;
        },

        // Sets background to the given image URL.
        // Defaults to slither.io's own background.
        setBackground: function (url) {
            url = typeof url !== 'undefined' ? url : '/s/bg45.jpg';
            window.ii.src = url;
        },

        // Draw a rectangle on the canvas.
        drawRect: function (rect, color, fill, alpha) {
            if (alpha === undefined) alpha = 1;

            var context = window.mc.getContext('2d');
            var lc = canvas.mapToCanvas({ x: rect.x, y: rect.y });

            context.save();
            context.globalAlpha = alpha;
            context.strokeStyle = color;
            context.rect(lc.x, lc.y, rect.width * window.gsc, rect.height * window.gsc);
            context.stroke();
            if (fill) {
                context.fillStyle = color;
                context.fill();
            }
            context.restore();
        },

        // Draw a circle on the canvas.
        drawCircle: function (circle, color, fill, alpha, text) {
            if (alpha === undefined) alpha = 1;
            if (circle.radius === undefined) circle.radius = 5;

            var context = window.mc.getContext('2d');
            var drawCircle = canvas.circleMapToCanvas(circle);

            context.save();
            context.globalAlpha = alpha;
            context.beginPath();
            context.strokeStyle = color;
            context.arc(drawCircle.x, drawCircle.y, drawCircle.radius, 0, Math.PI * 2);
            context.stroke();
            if (fill) {
                context.fillStyle = color;
                context.fill();
            }
            if (text !== undefined || text === "") {
                context.fillStyle = color;
                context.font = "14px Arial";
                context.textBaseline = "top";
                context.textAlign = "center";
                context.fillText("" + text, drawCircle.x, drawCircle.y);
            }
            context.restore();
        },

        // Draw an angle.
        // @param {number} start -- where to start the angle
        // @param {number} angle -- width of the angle
        // @param {bool} danger -- green if false, red if true
        drawAngle: function (start, angle, color, fill, alpha) {
            if (alpha === undefined) alpha = 0.6;

            var context = window.mc.getContext('2d');

            context.save();
            context.globalAlpha = alpha;
            context.beginPath();
            context.moveTo(window.mc.width / 2, window.mc.height / 2);
            context.arc(window.mc.width / 2, window.mc.height / 2, window.gsc * 100, start, angle);
            context.lineTo(window.mc.width / 2, window.mc.height / 2);
            context.closePath();
            context.stroke();
            if (fill) {
                context.fillStyle = color;
                context.fill();
            }
            context.restore();
        },

        // Draw a line on the canvas.
        drawLine: function (line, color, width) {
            if (width === undefined) width = 5;

            var context = window.mc.getContext('2d');
            var dp1 = canvas.mapToCanvas(canvas.point(line.x1,line.y1));
            var dp2 = canvas.mapToCanvas(canvas.point(line.x2,line.y2));

            context.save();
            context.beginPath();
            context.lineWidth = width * window.gsc;
            context.strokeStyle = color;
            context.moveTo(dp1.x, dp1.y);
            context.lineTo(dp2.x, dp2.y);
            context.stroke();
            context.restore();
        },

        // Given the start and end of a line, is point left of the line.
        isLeft: function (start, end, point) {
            return ((end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x)) > 0;
        },

        // Get distance squared
        getDistance2: function (x1, y1, x2, y2) {
            return (x1 - x2)*(x1 - x2) + (y1 - y2)*(y1 - y2);
        },

        getDistanceFromSnake: function (point) {
            point.distance = Math.sqrt(canvas.getDistance2(window.snake.xx, window.snake.yy, point.xx, point.yy));
            return point;
        },

        // return unit vector in the direction of the argument
        unitVector: function (v) {
            var l = Math.sqrt(v.x * v.x + v.y * v.y);
            if (l > 0) {
                return {
                    x: v.x / l,
                    y: v.y / l
                };
            } else {
                return {
                    x: 0,
                    y: 0
                };
            }
        },

        // Check if point in Rect
        pointInRect: function (point, rect) {
            if (rect.x <= point.x && rect.y <= point.y && rect.x + rect.width >= point.x && rect.y + rect.height >= point.y)
                return true;
            return false;
        },

        // check if point is in polygon
        pointInPoly: function (point, poly) {
            if (point.x < poly.minx || point.x > poly.maxx || point.y < poly.miny || point.y > poly.maxy) {
                return false;
            }
            let c = false;
            const l = poly.pts.length;
            for (let i = 0, j = l - 1; i < l; j = i++) {
                if ( ((poly.pts[i].y > point.y) != (poly.pts[j].y > point.y)) && (point.x < (poly.pts[j].x - poly.pts[i].x) * (point.y - poly.pts[i].y) / (poly.pts[j].y - poly.pts[i].y) + poly.pts[i].x) ) {
                    c = !c;
                }
            }
            return c;
        },

        addPolyBox: function (poly) {
            var minx = poly.pts[0].x;
            var maxx = poly.pts[0].x;
            var miny = poly.pts[0].y;
            var maxy = poly.pts[0].y;
            for (let p = 1, l = poly.pts.length; p < l; p++) {
                if (poly.pts[p].x < minx) minx = poly.pts[p].x;
                if (poly.pts[p].x > maxx) maxx = poly.pts[p].x;
                if (poly.pts[p].y < miny) miny = poly.pts[p].y;
                if (poly.pts[p].y > maxy) maxy = poly.pts[p].y;
            }
            return {
                pts: poly.pts,
                minx: minx,
                maxx: maxx,
                miny: miny,
                maxy: maxy
            };
        },

        cross: function (o, a, b) {
            return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
        },

        convexHullSort: function (a, b) {
            return a.x == b.x ? a.y - b.y : a.x - b.x;
        },

        convexHull: function (points) {
            points.sort(canvas.convexHullSort);

            var lower = [];
            for (let i = 0, l = points.length; i < l; i++) {
                while (lower.length >= 2 && canvas.cross(lower[lower.length - 2], lower[lower.length - 1], points[i]) <= 0) {
                    lower.pop();
                }
                lower.push(points[i]);
            }

            var upper = [];
            for (let i = points.length - 1; i >= 0; i--) {
                while (upper.length >= 2 && canvas.cross(upper[upper.length - 2], upper[upper.length - 1], points[i]) <= 0) {
                    upper.pop();
                }
                upper.push(points[i]);
            }

            upper.pop();
            lower.pop();
            return lower.concat(upper);
        },

        // Check if circles intersect
        circleIntersect: function (circle1, circle2) {
            var bothRadii = circle1.radius + circle2.radius;
            if (canvas.getDistance2(circle1.x, circle1.y, circle2.x, circle2.y) < bothRadii * bothRadii) {
                var point = {
                    x: ((circle1.x * circle2.radius) + (circle2.x * circle1.radius)) / bothRadii,
                    y: ((circle1.y * circle2.radius) + (circle2.y * circle1.radius)) / bothRadii,
                    ang: 0.0
                };

                point.ang = canvas.fastAtan2(point.y - window.snake.yy, point.x - window.snake.xx);

                if (window.visualDebugging) {
                    canvas.drawCircle(circle2, 'pink', false);
                    canvas.drawCircle(canvas.circle(point.x, point.y, 5), 'hotpink', true);
                }
                return point;
            }
            return false;
        },

        // Check if any point line intersects circle
        lineCircleIntersect: function (line, circle) { 
            var dx = line.x2-line.x1;
            var dy = line.y2-line.y1;
            if (dx === 0 && dy === 0) return false;

            //closest point on line
            var point = {
                x: (dx*dx*circle.x + dy*dy*line.x1 + dx*dy*(circle.y - line.y1))/(dy*dy+dx*dx),
                y: (dy*dy*circle.y + dx*dx*line.y1 + dx*dy*(circle.x - line.x1))/(dy*dy+dx*dx)
            };

            if (point.x < line.x1 && point.x < line.x2) point.x = Math.min(line.x1,line.x2);
            else if (point.x > line.x1 && point.x > line.x2) point.x = Math.max(line.x1,line.x2);

            if (point.y < line.y1 && point.y < line.y2) point.y = Math.min(line.y1,line.y2);
            else if (point.y > line.y1 && point.y > line.y2) point.y = Math.max(line.y1,line.y2);

            if (canvas.pointInCircle(point, circle)) return point;
            return false;
        },

        // Check if point is in circle
        pointInCircle: function (point, circle) {
            return canvas.getDistance2(point.x, point.y, circle.x, circle.y) <= circle.radius * circle.radius;
        }
    };
})(window);


var bot = window.bot = (function (window) {
    return {
        isBotRunning: false,
        isBotEnabled: true,
        stage: 'grow',
        collisionCircles: [],
        collisionAngles: [],
        foodAngles: [],
        scores: [],
        foodTimeout: undefined,
        sectorBoxSide: 0,
        defaultAccel: 0,
        sectorBox: {},
        currentFood: {},
        goal: 'food',
        radiusMult: 20,  // radius multiple for circle intersects
        opt: {
            // size of arc for collisionAngles
            arcSize: Math.PI / 8,
            // food cluster size to trigger acceleration
            foodAccelSz: 200,
            // maximum angle of food to trigger acceleration
            foodAccelDa: Math.PI / 2,
            // milliseconds to run each food check
            foodDelay: 100,
            // milliseconds to after collision avoidance before looking for food again
            collisionDelay: 500,
            // base speed
            speedBase: 5.78,
            // front angle size
            frontAngle: Math.PI / 2,
            // percent of angles covered by same snake to be considered an encircle attempt
            enCircleThreshold: 0.5625,
            // percent of angles covered by all snakes to move to safety
            enCircleAllThreshold: 0.5625,
            // distance multiplier for enCircleAllThreshold
            enCircleDistanceMult: 20,
            // snake score to start circling on self
            followCircleLength: 5000,
        },
        followCircleDirection: 1,  //initial direction for followCircle: +1 for counter clockwise and -1 for clockwise
        MID_X: 0,  //set these later after game starts
        MID_Y: 0,
        MAP_R: 0,
        MAXARC: 16,
        escLeft: true,
        escRight: true,
        escStraight: true,
        warnLeft: true,
        warnRight: true,
        warnStraight: true,

        getSnakeWidth: function (sc) {
            if (sc === undefined) sc = window.snake.sc;
            return Math.round(sc * 29.0);
        },

        connect: function () {
            if (window.force_ip && window.force_port)
                window.forceServer(window.force_ip, window.force_port);
            window.connect();
        },

        // Sorting by property 'score' descending
        sortScore: function (a, b) { return b.score - a.score; },

        // Sorting by property 'sz' descending
        sortSz: function (a, b) { return b.sz - a.sz; },

        // Sorting by property 'distance' ascending
        sortDistance: function (a, b) { return a.distance - b.distance; },

        // angleBetweenAbs - get the smallest absolute angle between two angles (any angle)
        angleBetweenAbs: function (a1, a2) {
            const PI2 = 2 * Math.PI;
            a1 = (a1 + PI2) % PI2 ;
            a2 = (a2 + PI2) % PI2 ;
            var aMin = Math.min(a1,a2);
            var aMax = Math.max(a1,a2);
            return Math.min(aMax - aMin , aMin - aMax + PI2);
        },

        setAccel: function(speed) {
            if (speed === undefined || speed === 0) speed = bot.defaultAccel;
            if (bot.isBotEnabled) window.setAcceleration(speed);
        },

        // Change heading to ang
        changeHeadingAbs: function (angle) {
            var cos = Math.cos(angle);
            var sin = Math.sin(angle);

            window.goalCoordinates = {
                x: Math.round( window.snake.xx + (bot.headCircle.radius) * cos),
                y: Math.round( window.snake.yy + (bot.headCircle.radius) * sin)
            };

            if (bot.isBotEnabled) canvas.setMouseCoordinates(canvas.mapToMouse(window.goalCoordinates));
        },

        // Change heading by ang
        // +0-pi turn left
        // -0-pi turn right
        changeHeadingRel: function (angle) {
            var heading = {
                x: window.snake.xx + 500 * bot.cos,
                y: window.snake.yy + 500 * bot.sin
            };

            var cos = Math.cos(-angle);
            var sin = Math.sin(-angle);

            window.goalCoordinates = {
                x: Math.round( cos * (heading.x - window.snake.xx) - sin * (heading.y - window.snake.yy) + window.snake.xx),
                y: Math.round( sin * (heading.x - window.snake.xx) + cos * (heading.y - window.snake.yy) + window.snake.yy)
            };

            if (bot.isBotEnabled) canvas.setMouseCoordinates(canvas.mapToMouse(window.goalCoordinates));
        },

        // Change heading to the best angle for avoidance.
        headingBestAngle: function () {
            var best;
            var distance;
            var openAngles = [];
            var openStart;

            var sIndex = bot.getAngleIndex(window.snake.ehang) + bot.MAXARC / 2;
            if (sIndex > bot.MAXARC) sIndex -= bot.MAXARC;

            for (var i = 0; i < bot.MAXARC; i++) {
                if (bot.collisionAngles[i] === undefined) {
                    distance = 0;
                    if (openStart === undefined) openStart = i;
                } else {
                    distance = bot.collisionAngles[i].distance;
                    if (openStart) {
                        openAngles.push({
                            openStart: openStart,
                            openEnd: i - 1,
                            sz: (i - 1) - openStart
                        });
                        openStart = undefined;
                    }
                }

                if (best === undefined || (best.distance < distance && best.distance !== 0)) {
                    best = {
                        distance: distance,
                        aIndex: i
                    };
                }
            }

            if (openStart && openAngles[0]) {
                openAngles[0].openStart = openStart;
                openAngles[0].sz = openAngles[0].openEnd - openStart;
                if (openAngles[0].sz < 0) openAngles[0].sz += bot.MAXARC;

            } else if (openStart) {
                openAngles.push({openStart: openStart, openEnd: openStart, sz: 0});
            }

            if (openAngles.length > 0) {
                openAngles.sort(bot.sortSz);
                bot.changeHeadingAbs( (openAngles[0].openEnd - openAngles[0].sz / 2) * bot.opt.arcSize);
            } else {
                bot.changeHeadingAbs(best.aIndex * bot.opt.arcSize);
            }
        },

        // Avoid collision point by ang
        // ang radians <= Math.PI (180deg)
        avoidPoint: function (point, ang) {
            if (ang === undefined || ang > Math.PI) ang = Math.PI;

            var end = {
                x: window.snake.xx + 2000 * bot.cos,
                y: window.snake.yy + 2000 * bot.sin
            };

            if (window.visualDebugging) {
                //canvas.drawLine(canvas.line(window.snake.xx, window.snake.yy, end.x, end.y), 'cyan', 5);
                canvas.drawLine(canvas.line(window.snake.xx, window.snake.yy, point.x, point.y), 'red', 5);
            }

            if (canvas.isLeft( { x: window.snake.xx, y: window.snake.yy }, end, { x: point.x, y: point.y })) {
                bot.changeHeadingAbs(point.ang - ang);
            } else {
                bot.changeHeadingAbs(point.ang + ang);
            }
        },

        // get collision angle index, expects angle +/i 0 to Math.PI
        getAngleIndex: function (angle) {
            if (angle < 0) angle += 2 * Math.PI;
            var index = Math.round(angle / bot.opt.arcSize);
            if (index === bot.MAXARC) return 0;
            return index;
        },

        // Add to collisionAngles if distance is closer
        addCollisionAngle: function (sp) {
            var ang = canvas.fastAtan2(Math.round(sp.yy - window.snake.yy), Math.round(sp.xx - window.snake.xx));
            var aIndex = bot.getAngleIndex(ang);

            var actualDistance = Math.round(sp.distance - sp.radius);

            if (bot.collisionAngles[aIndex] === undefined || bot.collisionAngles[aIndex].distance > actualDistance) {
                bot.collisionAngles[aIndex] = {
                    x: Math.round(sp.xx),
                    y: Math.round(sp.yy),
                    ang: ang,
                    snake: sp.snake,
                    distance: actualDistance,
                    radius: sp.radius,
                    aIndex: aIndex
                };
            }
        },

        // Get closest collision point per snake.
        getCollisionCircles: function () {
            var scPoint;

            bot.collisionCircles = [];
            bot.collisionAngles = [];

            for (var snake = 0, ls = window.snakes.length; snake < ls; snake++) {
                scPoint = undefined;

                if (window.snakes[snake].id !== window.snake.id && window.snakes[snake].alive_amt === 1) {

                    var s = window.snakes[snake];
                    var sWidth =  bot.getSnakeWidth(s.sc);
                    var sRadius = sWidth / 2;
                    var sSpMult = s.sp / bot.opt.speedBase;
                    //var sLen = Math.floor(15 * (window.fpsls[s.sct] + s.fam / window.fmlts[s.sct] - 1) - 5);
                    //sLen == 50 ? 14.0 / s.sp * bot.maxDistRevTime : bot.maxDistRevTime; //don't put huge radius on small snake.

                    var scPointOffset = 0;
                    var collRadius = 0;

                    if (bot.maxDistRevTime >= sWidth) {
                        scPointOffset = 0.65 * sWidth;
                        collRadius = sWidth*2;//bot.maxDistRevTime;
                    } else {
                        scPointOffset =  0.88 * bot.maxDistRevTime;
                        collRadius = sWidth*2;//(sWidth - bot.maxDistRevTime)/2+bot.maxDistRevTime-0.8*sWidth; //this is slightly bigger than it needs to be, but works.
                    }

                    scPoint = {
                        xx: s.xx + Math.cos(s.ehang) * scPointOffset,
                        yy: s.yy + Math.sin(s.ehang) * scPointOffset,
                        snake: snake,
                        radius: collRadius,
                        head: true
                    };

                    canvas.getDistanceFromSnake(scPoint);
                    bot.addCollisionAngle(scPoint);
                    bot.collisionCircles.push(scPoint);

                    if (window.visualDebugging){
                        canvas.drawCircle(canvas.circle(scPoint.xx, scPoint.yy, scPoint.radius),'red', false, 1, s.sct);
                    }

                    scPoint = undefined;

                    for (var pts = 0, lp = s.pts.length; pts < lp; pts++) {
                        if (!s.pts[pts].dying && canvas.pointInRect({ x: s.pts[pts].xx, y: s.pts[pts].yy }, bot.sectorBox)) {
                            var collisionCircle = {
                                xx: s.pts[pts].xx,
                                yy: s.pts[pts].yy,
                                snake: snake,
                                radius: sRadius
                            };

                            //if (window.visualDebugging) canvas.drawCircle(canvas.circle( collisionCircle.xx, collisionCircle.yy, collisionCircle.radius), 'lime', false);

                            canvas.getDistanceFromSnake(collisionCircle);
                            bot.addCollisionAngle(collisionCircle);

                            if (collisionCircle.distance <= bot.headCircle.radius + collisionCircle.radius) {
                                bot.collisionCircles.push(collisionCircle);
                                if (window.visualDebugging) canvas.drawCircle(canvas.circle(collisionCircle.xx,collisionCircle.yy, collisionCircle.radius), 'purple', false);
                            }
                        }
                    }
                }
            }

            // WALL - Outer edge of map
            bot.MID_X = window.grd;
            bot.MID_Y = window.grd;
            bot.MAP_R = window.grd * 0.98;
            if (canvas.getDistance2(bot.MID_X, bot.MID_Y, window.snake.xx, window.snake.yy) > (bot.MAP_R - 1000)*(bot.MAP_R - 1000)) {
                var midAng = canvas.fastAtan2(window.snake.yy - bot.MID_X, window.snake.xx - bot.MID_Y);
                scPoint = {
                    xx: bot.MID_X + bot.MAP_R * Math.cos(midAng),
                    yy: bot.MID_Y + bot.MAP_R * Math.sin(midAng),
                    snake: -1,
                    radius: bot.snakeWidth
                };
                canvas.getDistanceFromSnake(scPoint);
                bot.collisionCircles.push(scPoint);
                bot.addCollisionAngle(scPoint);

                if (window.visualDebugging) canvas.drawCircle(canvas.circle(scPoint.xx, scPoint.yy,scPoint.radius), 'Salmon', true);
            }

            bot.collisionCircles.sort(bot.sortDistance);

            if (window.visualDebugging) {
                for (var i = 0; i < bot.collisionAngles.length; i++)
                    if (bot.collisionAngles[i] !== undefined)
                        canvas.drawLine(canvas.line(window.snake.xx, window.snake.yy, bot.collisionAngles[i].x, bot.collisionAngles[i].y), 'darkred', 2);
            }
        },

        // Is collisionCircle (xx) in frontAngle
        inFrontAngle: function (point) {
            var ang = canvas.fastAtan2(Math.round(point.y - window.snake.yy), Math.round(point.x - window.snake.xx));

            return (bot.angleBetweenAbs(ang, window.snake.ehang) < bot.opt.frontAngle);
        },

        getEscapeDirs: function() {
            var point;
            bot.escLeft = true;
            bot.escRight = true;
            bot.escStraight = true;
            bot.warnLeft = true;
            bot.warnRight = true;
            bot.warnStraight = true;
            var i;
            var collisionCircle;

            for (i = 0; i < bot.collisionCircles.length; i++) {
                collisionCircle = canvas.circle(bot.collisionCircles[i].xx, bot.collisionCircles[i].yy, bot.collisionCircles[i].radius);
                point = canvas.circleIntersect(bot.warnCircle_r, collisionCircle);
                if (point) {
                    bot.warnRight = false;
                    break;
                }
            }

            for (i = 0; i < bot.collisionCircles.length; i++) {
                collisionCircle = canvas.circle(bot.collisionCircles[i].xx, bot.collisionCircles[i].yy, bot.collisionCircles[i].radius);
                point = canvas.circleIntersect(bot.warnCircle_l, collisionCircle);
                if (point) {
                    bot.warnLeft = false;
                    break;
                }
            }

            if (!bot.warnRight){
                for (i = 0; i < bot.collisionCircles.length; i++) {
                    collisionCircle = canvas.circle(bot.collisionCircles[i].xx, bot.collisionCircles[i].yy, bot.collisionCircles[i].radius);
                    point = canvas.circleIntersect(bot.escCircle_r, collisionCircle);
                    if (point) {
                        bot.escRight = false;
                        break;
                    }
                }
            }

            if (!bot.warnLeft){
                for (i = 0; i < bot.collisionCircles.length; i++) {
                    collisionCircle = canvas.circle(bot.collisionCircles[i].xx, bot.collisionCircles[i].yy, bot.collisionCircles[i].radius);
                    point = canvas.circleIntersect(bot.escCircle_l, collisionCircle);
                    if (point) {
                        bot.escLeft = false;
                        break;
                    }
                }
            }

            for (i = 0; i < bot.collisionCircles.length; i++) {
                collisionCircle = canvas.circle(bot.collisionCircles[i].xx, bot.collisionCircles[i].yy, bot.collisionCircles[i].radius);
                point = canvas.lineCircleIntersect(bot.warnStraightLine, collisionCircle);
                if (point) {
                    bot.warnStraight = false;
                    break;
                }
            }

            if (!bot.warnStraight){
                for (i = 0; i < bot.collisionCircles.length; i++) {
                    collisionCircle = canvas.circle(bot.collisionCircles[i].xx, bot.collisionCircles[i].yy, bot.collisionCircles[i].radius);
                    point = canvas.lineCircleIntersect(bot.escStraightLine, collisionCircle);
                    if (point) {
                        bot.escStraight = false;
                        break;
                    }
                }
            }

            if (window.visualDebugging){
                if (bot.escRight){
                    if (bot.warnRight){
                        canvas.drawCircle(bot.warnCircle_r, 'yellow', false);
                    } else {
                        canvas.drawCircle(bot.warnCircle_r, 'yellow', true, 0.2);
                    }
                    canvas.drawCircle(bot.escCircle_r, 'red', false);
                } else {
                    canvas.drawCircle(bot.warnCircle_r, 'yellow', true, 0.2);
                    canvas.drawCircle(bot.escCircle_r, 'red', true, 0.2);
                }
                if (bot.escLeft){
                    if (bot.warnLeft){
                        canvas.drawCircle(bot.warnCircle_l, 'yellow', false);
                    } else {
                        canvas.drawCircle(bot.warnCircle_l, 'yellow', true, 0.2);
                    }
                    canvas.drawCircle(bot.escCircle_l, 'red', false);
                } else {
                    canvas.drawCircle(bot.warnCircle_l, 'yellow', true, 0.2);
                    canvas.drawCircle(bot.escCircle_l, 'red', true, 0.2);
                }
                if (bot.escStraight){
                    if (bot.warnStraight){
                        canvas.drawLine(bot.warnStraightLine, 'yellow', 1);
                    } else {
                        canvas.drawLine(bot.warnStraightLine, 'yellow', 10);
                    }
                    canvas.drawLine(bot.escStraightLine, 'red', 1);
                } else {
                    canvas.drawLine(bot.warnStraightLine, 'yellow', 10);
                    canvas.drawLine(bot.escStraightLine, 'red', 20);
                }
            }

        },

        // Checks to see if you are going to collide with anything in the collision detection radius, if so avoid it.
        checkCollision: function () {
            var point;

            if (bot.collisionCircles.length === 0) return false;

            for (var i = 0; i < bot.collisionCircles.length; i++) {
                var collisionCircle = canvas.circle(bot.collisionCircles[i].xx, bot.collisionCircles[i].yy, bot.collisionCircles[i].radius);

                // -1 snake is special case for non snake object.
                if ((point = canvas.circleIntersect(bot.headCircle, collisionCircle)) && bot.inFrontAngle(point)) {
                    if (bot.collisionCircles[i].snake !== -1 && bot.collisionCircles[i].head && window.snakes[bot.collisionCircles[i].snake].sp > 10) {
                        bot.setAccel(1);
                    } else {
                        bot.setAccel();
                    }
                    bot.avoidPoint(point);
                    return true;
                }
            }

            bot.setAccel();
            return false;
        },

        //needs to run after collision check to identify snake hazards first
        checkEncircle: function () {
            var enSnake = [];
            var high = 0;
            var highSnake;
            var enAll = 0;

            for (var i = 0; i < bot.collisionAngles.length; i++) {
                if (bot.collisionAngles[i] !== undefined) {
                    var s = bot.collisionAngles[i].snake;
                    if (!enSnake[s]) {
                        enSnake[s] = 1;
                    } else {
                        enSnake[s]++;
                    }
                    if (enSnake[s] > high) {
                        high = enSnake[s];
                        highSnake = s;
                    }

                    if (bot.collisionAngles[i].distance < bot.snakeRadius * bot.opt.enCircleDistanceMult)
                        enAll++;
                }
            }

            if (high > bot.MAXARC * bot.opt.enCircleThreshold) {
                bot.headingBestAngle();

                if (high !== bot.MAXARC && window.snakes[highSnake].sp > 10) {
                    bot.setAccel(1);
                } else {
                    bot.setAccel();
                }

                if (window.visualDebugging) canvas.drawCircle(canvas.circle( window.snake.xx, window.snake.yy, bot.radiusMult * bot.snakeRadius), 'orange', true, 0.2);

                return true;
            }

            if (enAll > bot.MAXARC * bot.opt.enCircleAllThreshold) {
                bot.headingBestAngle();
                bot.setAccel();

                if (window.visualDebugging) canvas.drawCircle(canvas.circle(window.snake.xx, window.snake.yy, bot.snakeRadius * bot.opt.enCircleDistanceMult), 'yellow', true, 0.2);

                return true;
            } else {
                if (window.visualDebugging) canvas.drawCircle(canvas.circle(window.snake.xx, window.snake.yy, bot.snakeRadius * bot.opt.enCircleDistanceMult), 'yellow');
            }

            bot.setAccel();
            return false;
        },

        // Add and score foodAngles
        addFoodAngle: function (f) {
            var ang = canvas.fastAtan2(Math.round(f.yy - window.snake.yy), Math.round(f.xx - window.snake.xx));
            var da = bot.angleBetweenAbs(ang, window.snake.ehang);

            var aIndex = bot.getAngleIndex(ang);

            canvas.getDistanceFromSnake(f);

            var effDist =  f.distance + bot.snakeWidth * bot.speedMult * da; //add amount snake has to turn to distance
            var score = f.sz / effDist * (4 - da);

            if (bot.collisionAngles[aIndex] === undefined || bot.collisionAngles[aIndex].distance > f.distance + bot.snakeRadius * bot.radiusMult * bot.speedMult / 2) {
                if (bot.foodAngles[aIndex] === undefined) {
                    bot.foodAngles[aIndex] = {
                        x: Math.round(f.xx),
                        y: Math.round(f.yy),
                        ang: ang,
                        da: da,
                        distance: effDist,
                        sz: Math.round(f.sz),
                        score: score
                    };
                } else {
                    bot.foodAngles[aIndex].sz += f.sz;
                    bot.foodAngles[aIndex].score += score;
                    if (bot.foodAngles[aIndex].distance > effDist) {
                        bot.foodAngles[aIndex].x = f.xx;
                        bot.foodAngles[aIndex].y = f.yy;
                        bot.foodAngles[aIndex].distance = effDist;
                    }
                }
                //if food gets close, add its score to adjacent angles, so snake target doesn't pop around.

                if (true) return;
                if (effDist < bot.snakeWidth * 2){
                    var prevIndex = (aIndex - 1 + MAXARC) % MAXARC;
                    var nextIndex = (aIndex + 1) % MAXARC;
                    bot.foodAngles[prevIndex].sz += f.sz;
                    bot.foodAngles[nextIndex].score += score;
                }
                if (effDist < bot.snakeWidth){
                    var prevIndex = (aIndex - 2 + MAXARC) % MAXARC;
                    var nextIndex = (aIndex + 2) % MAXARC;
                    bot.foodAngles[prevIndex].sz += f.sz;
                    bot.foodAngles[nextIndex].score += score;
                }
            }
        },

        computeFoodGoal: function () {
            bot.foodAngles = [];

            for (var i = 0; i < window.foods.length && window.foods[i] !== null; i++) {
                var f = window.foods[i];

                if (!f.eaten && !(canvas.pointInCircle({x:f.xx, y:f.yy}, bot.sidecircle_l) || canvas.pointInCircle({x:f.xx, y:f.yy}, bot.sidecircle_r)))
                    bot.addFoodAngle(f);
            }

            bot.foodAngles.sort(bot.sortScore);

            if (bot.foodAngles[0] !== undefined && bot.foodAngles[0].sz > 0) {
                bot.currentFood = { x: Math.round(bot.foodAngles[0].x),
                                   y: Math.round(bot.foodAngles[0].y),
                                   sz: Math.round(bot.foodAngles[0].sz),
                                   da: bot.foodAngles[0].da };
            } else {
                bot.currentFood = { x: bot.MID_X, y: bot.MID_Y, sz: 0 };
            }
        },

        foodAccel: function () {
            var aIndex = 0;

            if (bot.currentFood && bot.currentFood.sz > bot.opt.foodAccelSz) {
                aIndex = bot.getAngleIndex(bot.currentFood.ang);

                if (bot.collisionAngles[aIndex] && bot.collisionAngles[aIndex].distance > bot.currentFood.distance + bot.snakeRadius * bot.radiusMult && bot.currentFood.da < bot.opt.foodAccelDa)
                    return 1;

                if (bot.collisionAngles[aIndex] === undefined && bot.currentFood.da < bot.opt.foodAccelDa)
                    return 1;
            }

            return bot.defaultAccel;
        },


        //display info on each food/food angle
        tempfoodinfo: function(){
            if (!window.visualDebugging) return;

            if (true) return;

            for (var i = 0; i < window.foods.length && window.foods[i] !== null; i++) {
                var f = window.foods[i];
                var ang = canvas.fastAtan2(Math.round(f.yy - window.snake.yy), Math.round(f.xx - window.snake.xx));
                var da = bot.angleBetweenAbs(ang, window.snake.ehang);
            }

            for (i = 0; i < bot.MAXARC; i++) {
                var ang = bot.opt.arcSize*(i+0.5);
                canvas.drawLine(canvas.line(window.snake.xx, window.snake.yy, window.snake.xx + Math.cos(ang)*10000, window.snake.yy + Math.sin(ang)*10000), 'yellow',1);
            }

            for (i = 0; i < bot.foodAngles.length; i++) {
                if (bot.foodAngles[i] === undefined) continue;
                var fa = bot.foodAngles[i];
                canvas.drawCircle(canvas.circle(fa.x, fa.y, 50), 'yellow', false, 1, Math.round(fa.score*100));
            }

        },

        toCircle: function () {
            for (var i = 0; i < window.snake.pts.length && window.snake.pts[i].dying; i++);
            var o = bot.followCircleDirection;
            var tailCircle = canvas.circle(
                window.snake.pts[i].xx,
                window.snake.pts[i].yy,
                bot.headCircle.radius
            );

            if (window.visualDebugging) canvas.drawCircle(tailCircle, 'blue', false);

            bot.setAccel();
            bot.changeHeadingRel(o * Math.PI / 32);

            if (canvas.circleIntersect(bot.headCircle, tailCircle))
                bot.stage = 'circle';
        },

        populatePts: function () {
            let x = window.snake.xx + window.snake.fx;
            let y = window.snake.yy + window.snake.fy;
            let l = 0.0;
            bot.pts = [{ x: x, y: y, len: l }];
            for (let p = window.snake.pts.length - 1; p >= 0; p--) {
                if (window.snake.pts[p].dying) {
                    continue;
                } else {
                    let xx = window.snake.pts[p].xx + window.snake.pts[p].fx;
                    let yy = window.snake.pts[p].yy + window.snake.pts[p].fy;
                    let ll = l + Math.sqrt(canvas.getDistance2(x, y, xx, yy));
                    bot.pts.push({
                        x: xx,
                        y: yy,
                        len: ll
                    });
                    x = xx;
                    y = yy;
                    l = ll;
                }
            }
            bot.len = l;
        },

        // set the direction of rotation based on the velocity of
        // the head with respect to the center of mass
        determineCircleDirection: function () {
            // find center mass (cx, cy)
            let cx = 0.0;
            let cy = 0.0;
            let pn = bot.pts.length;
            for (let p = 0; p < pn; p++) {
                cx += bot.pts[p].x;
                cy += bot.pts[p].y;
            }
            cx /= pn;
            cy /= pn;

            // vector from (cx, cy) to the head
            let head = {
                x: window.snake.xx + window.snake.fx,
                y: window.snake.yy + window.snake.fy
            };
            let dx = head.x - cx;
            let dy = head.y - cy;

            // check the sign of dot product of (bot.cos, bot.sin) and (-dy, dx)
            if (- dy * bot.cos + dx * bot.sin > 0) {
                // clockwise
                bot.followCircleDirection = -1;
            } else {
                // couter clockwise
                bot.followCircleDirection = +1;
            }
        },

        // returns a point on snake's body on given length from the head
        // assumes that bot.pts is populated
        smoothPoint: function (t) {
            // range check
            if (t >= bot.len) {
                let tail = bot.pts[bot.pts.length - 1];
                return {
                    x: tail.x,
                    y: tail.y
                };
            } else if (t <= 0 ) {
                return {
                    x: bot.pts[0].x,
                    y: bot.pts[0].y
                };
            }
            // binary search
            let p = 0;
            let q = bot.pts.length - 1;
            while (q - p > 1) {
                let m = Math.round((p + q) / 2);
                if (t > bot.pts[m].len) {
                    p = m;
                } else {
                    q = m;
                }
            }
            // now q = p + 1, and the point is in between;
            // compute approximation
            let wp = bot.pts[q].len - t;
            let wq = t - bot.pts[p].len;
            let w = wp + wq;
            return {
                x: (wp * bot.pts[p].x + wq * bot.pts[q].x) / w,
                y: (wp * bot.pts[p].y + wq * bot.pts[q].y) / w
            };
        },

        // finds a point on snake's body closest to the head;
        // returns length from the head
        // excludes points close to the head
        closestBodyPoint: function () {
            let head = {
                x: window.snake.xx + window.snake.fx,
                y: window.snake.yy + window.snake.fy
            };

            let ptsLength = bot.pts.length;

            // skip head area
            let start_n = 0;
            let start_d2 = 0.0;
            for ( ;; ) {
                let prev_d2 = start_d2;
                start_n++;
                start_d2 = canvas.getDistance2(head.x, head.y, bot.pts[start_n].x, bot.pts[start_n].y);
                if (start_d2 < prev_d2 || start_n == ptsLength - 1)
                    break;
            }

            if (start_n >= ptsLength || start_n <= 1)
                return bot.len;

            // find closets point in bot.pts
            let min_n = start_n;
            let min_d2 = start_d2;
            for (let n = min_n + 1; n < ptsLength; n++) {
                let d2 = canvas.getDistance2(head.x, head.y, bot.pts[n].x, bot.pts[n].y);
                if (d2 < min_d2) {
                    min_n = n;
                    min_d2 = d2;
                }
            }

            // find second closest point
            let next_n = min_n;
            let next_d2 = min_d2;
            if (min_n == ptsLength - 1) {
                next_n = min_n - 1;
                next_d2 = canvas.getDistance2(head.x, head.y, bot.pts[next_n].x, bot.pts[next_n].y);
            } else {
                let d2m = canvas.getDistance2(head.x, head.y, bot.pts[min_n - 1].x, bot.pts[min_n - 1].y);
                let d2p = canvas.getDistance2(head.x, head.y, bot.pts[min_n + 1].x, bot.pts[min_n + 1].y);
                if (d2m < d2p) {
                    next_n = min_n - 1;
                    next_d2 = d2m;
                } else {
                    next_n = min_n + 1;
                    next_d2 = d2p;
                }
            }

            // compute approximation
            let t2 = bot.pts[min_n].len - bot.pts[next_n].len;
            t2 *= t2;

            if (t2 === 0) {
                return bot.pts[min_n].len;
            } else {
                let min_w = t2 - (min_d2 - next_d2);
                let next_w = t2 + (min_d2 - next_d2);
                return (bot.pts[min_n].len * min_w + bot.pts[next_n].len * next_w) / (2 * t2);
            }
        },

        bodyDangerZone: function ( offset, targetPoint, targetPointNormal, closePointDist, pastTargetPoint, closePoint) {
            var head = {
                x: window.snake.xx + window.snake.fx,
                y: window.snake.yy + window.snake.fy
            };
            var o = bot.followCircleDirection;
            var pts = [
                { x: head.x - o * offset * bot.sin,
                 y: head.y + o * offset * bot.cos
                },
                { x: head.x + bot.snakeWidth * bot.cos + offset * (bot.cos - o * bot.sin),
                 y: head.y + bot.snakeWidth * bot.sin + offset * (bot.sin + o * bot.cos)
                },
                { x: head.x + 1.75 * bot.snakeWidth * bot.cos + o * 0.3 * bot.snakeWidth * bot.sin + offset * (bot.cos - o * bot.sin),
                 y: head.y + 1.75 * bot.snakeWidth * bot.sin - o * 0.3 * bot.snakeWidth * bot.cos + offset * (bot.sin + o * bot.cos)
                },
                { x: head.x + 2.5 * bot.snakeWidth * bot.cos + o * 0.7 * bot.snakeWidth * bot.sin + offset * (bot.cos - o * bot.sin),
                 y: head.y + 2.5 * bot.snakeWidth * bot.sin - o * 0.7 * bot.snakeWidth * bot.cos + offset * (bot.sin + o * bot.cos)
                },
                { x: head.x + 3 * bot.snakeWidth * bot.cos + o * 1.2 * bot.snakeWidth * bot.sin + offset * bot.cos,
                 y: head.y + 3 * bot.snakeWidth * bot.sin - o * 1.2 * bot.snakeWidth * bot.cos + offset * bot.sin
                },
                { x: targetPoint.x + targetPointNormal.x * (offset + 0.5 * Math.max(closePointDist, 0)),
                 y: targetPoint.y + targetPointNormal.y * (offset + 0.5 * Math.max(closePointDist, 0))
                },
                { x: pastTargetPoint.x + targetPointNormal.x * offset,
                 y: pastTargetPoint.y + targetPointNormal.y * offset
                },
                pastTargetPoint,
                targetPoint,
                closePoint
            ];
            pts = canvas.convexHull(pts);
            var poly = {
                pts: pts
            };
            poly = canvas.addPolyBox(poly);
            return (poly);
        },

        followCircleSelf: function () {
            bot.populatePts();
            bot.determineCircleDirection();
            var o = bot.followCircleDirection;

            // exit if too short
            if (bot.len < 9 * bot.snakeWidth) return;

            var head = {
                x: window.snake.xx + window.snake.fx,
                y: window.snake.yy + window.snake.fy
            };

            let closePointT = bot.closestBodyPoint();
            let closePoint = bot.smoothPoint(closePointT);

            // approx tangent and normal vectors and closePoint
            var closePointNext = bot.smoothPoint(closePointT - bot.snakeWidth);
            var closePointTangent = canvas.unitVector({
                x: closePointNext.x - closePoint.x,
                y: closePointNext.y - closePoint.y});
            var closePointNormal = {
                x: - o * closePointTangent.y,
                y:   o * closePointTangent.x
            };

            // angle wrt closePointTangent
            var currentCourse = Math.asin(Math.max(-1, Math.min(1, bot.cos * closePointNormal.x + bot.sin * closePointNormal.y)));

            // compute (oriented) distance from the body at closePointDist
            var closePointDist = (head.x - closePoint.x) * closePointNormal.x + (head.y - closePoint.y) * closePointNormal.y;

            // construct polygon for snake inside
            var insidePolygonStartT = 5 * bot.snakeWidth;
            var insidePolygonEndT = closePointT + 5 * bot.snakeWidth;
            var insidePolygonPts = [
                bot.smoothPoint(insidePolygonEndT),
                bot.smoothPoint(insidePolygonStartT)
            ];
            for (let t = insidePolygonStartT; t < insidePolygonEndT; t += bot.snakeWidth) {
                insidePolygonPts.push(bot.smoothPoint(t));
            }

            var insidePolygon = canvas.addPolyBox({ pts: insidePolygonPts });

            // get target point; this is an estimate where we land if we hurry
            var targetPointT = closePointT;
            var targetPointFar = 0.0;
            let targetPointStep = bot.snakeWidth / 64;
            for (let h = closePointDist, a = currentCourse; h >= 0.125 * bot.snakeWidth; ) {
                targetPointT -= targetPointStep;
                targetPointFar += targetPointStep * Math.cos(a);
                h += targetPointStep * Math.sin(a);
                a = Math.max(-Math.PI / 4, a - targetPointStep / bot.snakeWidth);
            }

            var targetPoint = bot.smoothPoint(targetPointT);

            var pastTargetPointT = targetPointT - 3 * bot.snakeWidth;
            var pastTargetPoint = bot.smoothPoint(pastTargetPointT);

            // look for danger from enemies
            var enemyBodyOffsetDelta = 0.25 * bot.snakeWidth;
            var enemyHeadDist2 = 64 * 64 * bot.snakeWidth * bot.snakeWidth;
            for (let snake = 0, snakesNum = window.snakes.length; snake < snakesNum; snake++) {
                if (window.snakes[snake].id !== window.snake.id && window.snakes[snake].alive_amt === 1) {
                    let enemyHead = {
                        x: window.snakes[snake].xx + window.snakes[snake].fx,
                        y: window.snakes[snake].yy + window.snakes[snake].fy
                    };
                    let enemyAhead = {
                        x: enemyHead.x + Math.cos(window.snakes[snake].ang) * bot.snakeWidth,
                        y: enemyHead.y + Math.sin(window.snakes[snake].ang) * bot.snakeWidth
                    };
                    // heads
                    if (!canvas.pointInPoly(enemyHead, insidePolygon))
                        enemyHeadDist2 = Math.min(enemyHeadDist2, canvas.getDistance2(enemyHead.x,  enemyHead.y, targetPoint.x, targetPoint.y), canvas.getDistance2(enemyAhead.x, enemyAhead.y, targetPoint.x, targetPoint.y) );

                    // bodies
                    let offsetSet = false;
                    let offset = 0.0;
                    let cpolbody = {};
                    for (let pts = 0, ptsNum = window.snakes[snake].pts.length;  pts < ptsNum; pts++) {
                        if (!window.snakes[snake].pts[pts].dying) {
                            let point = {
                                x: window.snakes[snake].pts[pts].xx + window.snakes[snake].pts[pts].fx,
                                y: window.snakes[snake].pts[pts].yy + window.snakes[snake].pts[pts].fy
                            };
                            while (!offsetSet || (enemyBodyOffsetDelta >= -bot.snakeWidth && canvas.pointInPoly(point, cpolbody))) {
                                if (!offsetSet) {
                                    offsetSet = true;
                                } else {
                                    enemyBodyOffsetDelta -= 0.0625 * bot.snakeWidth;
                                }
                                offset = 0.5 * (bot.snakeWidth + bot.getSnakeWidth(window.snakes[snake].sc)) + enemyBodyOffsetDelta;
                                cpolbody = bot.bodyDangerZone(offset, targetPoint, closePointNormal, closePointDist, pastTargetPoint, closePoint);
                            }
                        }
                    }
                }
            }
            var enemyHeadDist = Math.sqrt(enemyHeadDist2) * 0.75; //add safety to make enemy head appear closer

            // plot inside polygon
            if (window.visualDebugging) {
                for (let p = 0, l = insidePolygon.pts.length; p < l; p++) {
                    let q = p + 1;
                    if (q == l) q = 0;
                    canvas.drawLine(canvas.line(insidePolygon.pts[p].x, insidePolygon.pts[p].y, insidePolygon.pts[q].x, insidePolygon.pts[q].y), 'orange');
                }
            }

            // mark closePoint
            if (window.visualDebugging) canvas.drawCircle(canvas.circle( closePoint.x,closePoint.y, bot.snakeWidth * 0.25), 'white', false);

            // mark safeZone
            if (window.visualDebugging) {
                canvas.drawCircle(canvas.circle( targetPoint.x, targetPoint.y, bot.snakeWidth + 2 * targetPointFar), 'white', false);
                canvas.drawCircle(canvas.circle( targetPoint.x, targetPoint.y, 0.2 * bot.snakeWidth), 'white', false);
            }

            // draw sample cpolbody
            if (window.visualDebugging) {
                let soffset = 0.5 * bot.snakeWidth;
                let scpolbody = bot.bodyDangerZone(
                    soffset, targetPoint, closePointNormal,
                    closePointDist, pastTargetPoint, closePoint);
                for (let p = 0, l = scpolbody.pts.length; p < l; p++) {
                    let q = p + 1;
                    if (q == l) {
                        q = 0;
                    }
                    canvas.drawLine(canvas.line( scpolbody.pts[p].x, scpolbody.pts[p].y, scpolbody.pts[q].x, scpolbody.pts[q].y), 'white');
                }
            }

            // TAKE ACTION

            // expand?
            let targetCourse = currentCourse + 0.25;
            // enemy head nearby?
            let headProx = -1.0 - (2 * targetPointFar - enemyHeadDist) / bot.snakeWidth;
            if (headProx > 0) {
                headProx = 0.125 * headProx * headProx;
            } else {
                headProx = - 0.5 * headProx * headProx;
            }
            targetCourse = Math.min(targetCourse, headProx);
            // enemy body nearby?
            targetCourse = Math.min( targetCourse, targetCourse + (enemyBodyOffsetDelta - 0.0625 * bot.snakeWidth) / bot.snakeWidth);
            // small tail?
            var tailBehind = bot.len - closePointT;
            var targetDir = canvas.unitVector({x: bot.opt.followCircleTarget.x - head.x, y: bot.opt.followCircleTarget.y - head.y });
            var driftQ = targetDir.x * closePointNormal.x + targetDir.y * closePointNormal.y;
            var allowTail = bot.snakeWidth * (2 - 0.5 * driftQ);
            // a line in the direction of the target point
            if (window.visualDebugging) canvas.drawLine(canvas.line( head.x, head.y, head.x + allowTail * targetDir.x, head.y + allowTail * targetDir.y), 'red'); //???

            targetCourse = Math.min( targetCourse, (tailBehind - allowTail + (bot.snakeWidth - closePointDist)) / bot.snakeWidth);
            // far away?
            targetCourse = Math.min( targetCourse, - 0.5 * (closePointDist - 4 * bot.snakeWidth) / bot.snakeWidth);
            // final corrections
            // too fast in?
            targetCourse = Math.max(targetCourse, -0.75 * closePointDist / bot.snakeWidth);
            // too fast out?
            targetCourse = Math.min(targetCourse, 1.0);

            var goalDir = {
                x: closePointTangent.x * Math.cos(targetCourse) - o * closePointTangent.y * Math.sin(targetCourse),
                y: closePointTangent.y * Math.cos(targetCourse) + o * closePointTangent.x * Math.sin(targetCourse)
            };
            var goal = {
                x: head.x + goalDir.x * 4 * bot.snakeWidth,
                y: head.y + goalDir.y * 4 * bot.snakeWidth
            };


            if (window.goalCoordinates && Math.abs(goal.x - window.goalCoordinates.x) < 1000 && Math.abs(goal.y - window.goalCoordinates.y) < 1000) {
                window.goalCoordinates = {
                    x: Math.round(goal.x * 0.25 + window.goalCoordinates.x * 0.75),
                    y: Math.round(goal.y * 0.25 + window.goalCoordinates.y * 0.75)
                };
            } else {
                window.goalCoordinates = {
                    x: Math.round(goal.x),
                    y: Math.round(goal.y)
                };
            }

            if (bot.isBotEnabled) canvas.setMouseCoordinates(canvas.mapToMouse(window.goalCoordinates));
        },

        every: function () {
            if (bot.opt.followCircleTarget === undefined)
                bot.opt.followCircleTarget = { x: bot.MID_X, y: bot.MID_Y };

            bot.sectorBoxSide = Math.floor(Math.sqrt(window.sectors.length)) * window.sector_size;
            bot.sectorBox = canvas.rect( window.snake.xx - (bot.sectorBoxSide / 2), window.snake.yy - (bot.sectorBoxSide / 2), bot.sectorBoxSide, bot.sectorBoxSide);
            // if (window.visualDebugging) canvas.drawRect(bot.sectorBox, 'gray', true, 0.1);

            bot.cos = Math.cos(window.snake.ang);
            bot.sin = Math.sin(window.snake.ang);

            bot.speedMult = window.snake.sp / bot.opt.speedBase;
            bot.warndist = window.snake.sp * 3; // check 3 frames ahead
            bot.snakeWidth = bot.getSnakeWidth();
            bot.snakeRadius = bot.snakeWidth / 2;
            bot.turnRadius = bot.snakeWidth * bot.speedMult;
            bot.maxDistRevTime = bot.snakeWidth * Math.PI * 14 / bot.opt.speedBase;  //max distance other snakes can travel in time it takes to turn 180 deg
            bot.collCircleRadius = bot.turnRadius * 2.8 + bot.warndist*1.4;  //works out to 2.54 for high speed.  but leave 2.8 as at high speed need to be more careful.
            bot.collCircleAhead = bot.turnRadius;
            bot.snakeLength = Math.floor(15 * (window.fpsls[window.snake.sct] + window.snake.fam / window.fmlts[window.snake.sct] - 1) - 5);
            bot.radiusMult = Math.max(200000 / (10000 + bot.snakeLength),10);  //x20 for small snake, x10 for 10000+ length

            //var headRadiusMult = Math.min(1, bot.speedMult - 1) * bot.radiusMult / 2 * bot.snakeRadius;
            bot.headCircle = canvas.circle( window.snake.xx + bot.cos * bot.collCircleAhead, window.snake.yy + bot.sin * bot.collCircleAhead, bot.collCircleRadius*4);

            if (window.visualDebugging) canvas.drawCircle(bot.headCircle, 'blue', false);


            bot.sidecircle_r = canvas.circle(window.snake.xx - bot.sin * bot.turnRadius, window.snake.yy + bot.cos * bot.turnRadius, bot.turnRadius-bot.snakeRadius);
            bot.sidecircle_l = canvas.circle(window.snake.xx + bot.sin * bot.turnRadius, window.snake.yy - bot.cos * bot.turnRadius, bot.turnRadius-bot.snakeRadius);

            bot.escCircle_r = canvas.circle( bot.sidecircle_r.x, bot.sidecircle_r.y, bot.turnRadius + bot.snakeRadius*1.5);
            bot.escCircle_l = canvas.circle( bot.sidecircle_l.x, bot.sidecircle_l.y, bot.turnRadius + bot.snakeRadius*1.5);
            bot.warnCircle_r = canvas.circle(
                bot.sidecircle_r.x - bot.sin * bot.warndist + bot.cos * bot.warndist,
                bot.sidecircle_r.y + bot.cos * bot.warndist + bot.sin * bot.warndist,
                bot.escCircle_r.radius + bot.warndist
            );
            bot.warnCircle_l = canvas.circle(
                bot.sidecircle_l.x + bot.sin * bot.warndist + bot.cos * bot.warndist,
                bot.sidecircle_l.y - bot.cos * bot.warndist + bot.sin * bot.warndist,
                bot.escCircle_l.radius + bot.warndist
            );

            bot.escStraightLine = canvas.line(
                window.snake.xx,
                window.snake.yy,
                window.snake.xx + bot.cos * (bot.turnRadius + bot.snakeRadius*1.5)*2,
                window.snake.yy + bot.sin * (bot.turnRadius + bot.snakeRadius*1.5)*2
            );

            bot.warnStraightLine = canvas.line(
                window.snake.xx,
                window.snake.yy,
                window.snake.xx + bot.cos * (bot.turnRadius + bot.snakeRadius*1.5)*5,
                window.snake.yy + bot.sin * (bot.turnRadius + bot.snakeRadius*1.5)*5
            );
            
            if (window.visualDebugging) {
                canvas.drawCircle(bot.sidecircle_r, 'green', false);
                canvas.drawCircle(bot.sidecircle_l, 'green', false);
            }

            canvas.drawCircle(bot.headCircle, 'blue', false, 1, "");


            bot.tempfoodinfo();

        },

        // Main bot
        go: function () {
            bot.every();

            if (bot.snakeLength < bot.opt.followCircleLength)
                bot.stage = 'grow';

            if (bot.currentFood && bot.stage !== 'grow')
                bot.currentFood = undefined;

            if (bot.stage === 'circle') {
                bot.setAccel();
                bot.followCircleSelf();
            } else {
                bot.getCollisionCircles();
                bot.getEscapeDirs();
                if (bot.checkCollision() || bot.checkEncircle()) {
                    bot.goal = 'avoid';
                    if (bot.foodActionTimeout) {
                        window.clearTimeout(bot.foodActionTimeout);
                        bot.foodActionTimeout = window.setTimeout(bot.foodActionTimer, bot.opt.collisionDelay);
                    }
                } else {
                    bot.goal = 'food';
                    if (bot.snakeLength > bot.opt.followCircleLength){
                        bot.stage = 'tocircle';
                        bot.toCircle();
                        return;
                    }

                    if (bot.foodActionTimeout === undefined)
                        bot.foodActionTimeout = window.setTimeout(bot.foodActionTimer, bot.opt.foodDelay);

                    bot.setAccel(bot.foodAccel());
                }
            }
        },

        // Check for food updates every so often
        foodActionTimer: function () {
            if (window.playing && window.snake !== null && window.snake.alive_amt === 1) {
                if (bot.stage === 'grow') {
                    bot.computeFoodGoal();
                    window.goalCoordinates = bot.currentFood;
                    if (bot.isBotEnabled) canvas.setMouseCoordinates(canvas.mapToMouse(window.goalCoordinates));
                } else if (bot.stage === 'tocircle') {
                    bot.toCircle();
                }
            }
            bot.foodActionTimeout = undefined;
        }
    };
})(window);

var userInterface = window.userInterface = (function (window, document) {
    // Save the original slither.io functions so we can modify them, or reenable them later.
    var original_keydown = document.onkeydown;
    var original_onmouseDown = window.onmousedown;
    var original_oef = window.oef;
    var original_redraw = window.redraw;
    var original_onmousemove = window.onmousemove;

    window.oef = function () { };
    window.redraw = function () { };

    return {
        overlays: {},
        gfxEnabled: true,

        initServerIp: function () {
            var parent = document.getElementById('playh');
            var serverDiv = document.createElement('div');
            var serverIn = document.createElement('input');

            serverDiv.style.width = '244px';
            serverDiv.style.margin = '-30px auto';
            serverDiv.style.boxShadow = 'rgb(0, 0, 0) 0px 6px 50px';
            serverDiv.style.opacity = 1;
            serverDiv.style.background = 'rgb(76, 68, 124)';
            serverDiv.className = 'taho';
            serverDiv.style.display = 'block';

            serverIn.className = 'sumsginp';
            serverIn.placeholder = '0.0.0.0:444';
            serverIn.maxLength = 21;
            serverIn.style.width = '220px';
            serverIn.style.height = '24px';

            serverDiv.appendChild(serverIn);
            parent.appendChild(serverDiv);

            userInterface.server = serverIn;
        },

        initOverlays: function () {
            var botOverlay = document.createElement('div');
            botOverlay.style.position = 'fixed';
            botOverlay.style.right = '5px';
            botOverlay.style.bottom = '112px';
            botOverlay.style.width = '150px';
            botOverlay.style.height = '85px';
            // botOverlay.style.background = 'rgba(0, 0, 0, 0.5)';
            botOverlay.style.color = '#C0C0C0';
            botOverlay.style.fontFamily = 'Consolas, Verdana';
            botOverlay.style.zIndex = 999;
            botOverlay.style.fontSize = '14px';
            botOverlay.style.padding = '5px';
            botOverlay.style.borderRadius = '5px';
            botOverlay.className = 'nsi';
            document.body.appendChild(botOverlay);

            var serverOverlay = document.createElement('div');
            serverOverlay.style.position = 'fixed';
            serverOverlay.style.right = '5px';
            serverOverlay.style.bottom = '5px';
            serverOverlay.style.width = '160px';
            serverOverlay.style.height = '14px';
            serverOverlay.style.color = '#C0C0C0';
            serverOverlay.style.fontFamily = 'Consolas, Verdana';
            serverOverlay.style.zIndex = 999;
            serverOverlay.style.fontSize = '14px';
            serverOverlay.className = 'nsi';
            document.body.appendChild(serverOverlay);

            var prefOverlay = document.createElement('div');
            prefOverlay.style.position = 'fixed';
            prefOverlay.style.left = '10px';
            prefOverlay.style.top = '75px';
            prefOverlay.style.width = '260px';
            prefOverlay.style.height = '210px';
            // prefOverlay.style.background = 'rgba(0, 0, 0, 0.5)';
            prefOverlay.style.color = '#C0C0C0';
            prefOverlay.style.fontFamily = 'Consolas, Verdana';
            prefOverlay.style.zIndex = 999;
            prefOverlay.style.fontSize = '14px';
            prefOverlay.style.padding = '5px';
            prefOverlay.style.borderRadius = '5px';
            prefOverlay.className = 'nsi';
            document.body.appendChild(prefOverlay);

            var statsOverlay = document.createElement('div');
            statsOverlay.style.position = 'fixed';
            statsOverlay.style.left = '10px';
            statsOverlay.style.top = '295px';
            statsOverlay.style.width = '140px';
            statsOverlay.style.height = '210px';
            // statsOverlay.style.background = 'rgba(0, 0, 0, 0.5)';
            statsOverlay.style.color = '#C0C0C0';
            statsOverlay.style.fontFamily = 'Consolas, Verdana';
            statsOverlay.style.zIndex = 998;
            statsOverlay.style.fontSize = '14px';
            statsOverlay.style.padding = '5px';
            statsOverlay.style.borderRadius = '5px';
            statsOverlay.className = 'nsi';
            document.body.appendChild(statsOverlay);

            userInterface.overlays.botOverlay = botOverlay;
            userInterface.overlays.serverOverlay = serverOverlay;
            userInterface.overlays.prefOverlay = prefOverlay;
            userInterface.overlays.statsOverlay = statsOverlay;
        },

        toggleOverlays: function () {
            Object.keys(userInterface.overlays).forEach(function (okey) {
                var oVis = userInterface.overlays[okey].style.visibility !== 'hidden' ? 'hidden' : 'visible';
                userInterface.overlays[okey].style.visibility = oVis;
                window.visualDebugging = oVis === 'visible';
            });
        },

        // Save variable to local storage
        savePreference: function (item, value) {
            window.localStorage.setItem(item, value);
            userInterface.onPrefChange();
        },

        // Load a variable from local storage
        loadPreference: function (preference, defaultVar) {
            var savedItem = window.localStorage.getItem(preference);
            if (savedItem !== null) {
                if (savedItem === 'true') {
                    window[preference] = true;
                } else if (savedItem === 'false') {
                    window[preference] = false;
                } else {
                    window[preference] = savedItem;
                }
            } else {
                window[preference] = defaultVar;
            }
            userInterface.onPrefChange();
            return window[preference];
        },

        // Saves username when you click on "Play" button
        playButtonClickListener: function () {
            userInterface.saveNick();
            userInterface.loadPreference('autoRespawn', false);
            userInterface.onPrefChange();

            if (userInterface.server.value) {
                let s = userInterface.server.value.split(':');
                if (s.length === 2) {
                    window.force_ip = s[0];
                    window.force_port = s[1];
                    bot.connect();
                }
            } else {
                window.force_ip = undefined;
                window.force_port = undefined;
            }
        },

        // Preserve nickname
        saveNick: function () {
            var nick = document.getElementById('nick').value;
            userInterface.savePreference('savedNick', nick);
        },

        // Hide top score
        hideTop: function () {
            var nsidivs = document.querySelectorAll('div.nsi');
            for (var i = 0; i < nsidivs.length; i++) {
                if (nsidivs[i].style.top === '4px' && nsidivs[i].style.width === '300px') {
                    nsidivs[i].style.visibility = 'hidden';
                    bot.isTopHidden = true;
                    window.topscore = nsidivs[i];
                }
            }
        },

        // Store FPS data
        framesPerSecond: {
            fps: 0,
            fpsTimer: function () {
                if (window.playing && window.fps && window.lrd_mtm) {
                    if (Date.now() - window.lrd_mtm > 970) userInterface.framesPerSecond.fps = window.fps;
                }
            }
        },

        onkeydown: function (e) {
            // Original slither.io onkeydown function + whatever is under it
            original_keydown(e);
            if (window.playing) {
                // Letter `T` to toggle bot
                if (e.keyCode === 84) {
                    bot.isBotEnabled = !bot.isBotEnabled;
                }
                // Letter 'V' to toggle debugging (visual)
                if (e.keyCode === 86) {
                    window.visualDebugging = !window.visualDebugging;
                    userInterface.savePreference('visualDebugging', window.visualDebugging);
                }
                // Letter 'I' to toggle autorespawn
                if (e.keyCode === 73) {
                    window.autoRespawn = !window.autoRespawn;
                    userInterface.savePreference('autoRespawn', window.autoRespawn);
                }
                // Letter 'H' to toggle hidden mode
                if (e.keyCode === 72) {
                    userInterface.toggleOverlays();
                }
                userInterface.onPrefChange();
            }
        },

        onmousedown: function (e) {
            if (window.playing) {
                switch (e.which) {
                    case 1:  // "Left click" to manually speed up the slither
                        bot.defaultAccel = 1;
                        if (!bot.isBotEnabled) original_onmouseDown(e);
                        break;

                    case 3:// "Right click" to toggle bot in addition to the letter "T"
                        bot.isBotEnabled = !bot.isBotEnabled;
                        break;
                }
            } else {
                original_onmouseDown(e);
            }
            userInterface.onPrefChange();
        },

        onmouseup: function () {
            bot.defaultAccel = 0;
        },

        // Update stats overlay.
        updateStats: function () {
            var oContent = [];
            var median;

            if (bot.scores.length === 0) return;

            median = Math.round((bot.scores[Math.floor((bot.scores.length - 1) / 2)] + bot.scores[Math.ceil((bot.scores.length - 1) / 2)]) / 2);

            oContent.push('games played: ' + bot.scores.length);
            oContent.push('a: ' + Math.round(bot.scores.reduce(function (a, b) { return a + b; }) / (bot.scores.length)) + ' m: ' + median);

            for (var i = 0; i < bot.scores.length && i < 10; i++) {
                oContent.push(i + 1 + '. ' + bot.scores[i]);
            }

            userInterface.overlays.statsOverlay.innerHTML = oContent.join('<br/>');
        },

        onPrefChange: function () {
            // Set static display options here.
            var oContent = [];
            var ht = userInterface.handleTextColor;

            oContent.push('version: ' + GM_info.script.version);
            oContent.push('[T / RMB] bot: ' + ht(bot.isBotEnabled));
            oContent.push('[I] auto respawn: ' + ht(window.autoRespawn));
            oContent.push('[V] visual debugging: ' + ht(window.visualDebugging));
            oContent.push('[H] hide overlay');
            oContent.push('[Mouse Wheel] zoom');

            userInterface.overlays.prefOverlay.innerHTML = oContent.join('<br/>');
        },

        onFrameUpdate: function () {
            // Botstatus overlay
            if (window.playing && window.snake !== null) {
                let oContent = [];

                oContent.push('fps: ' + userInterface.framesPerSecond.fps);

                // Display the X and Y of the snake
                oContent.push('x: ' + (Math.round(window.snake.xx) || 0) + ' y: ' + (Math.round(window.snake.yy) || 0));

                if (window.goalCoordinates) {
                    oContent.push('target');
                    oContent.push('x: ' + window.goalCoordinates.x + ' y: ' + window.goalCoordinates.y);
                    if (window.goalCoordinates.sz)
                        oContent.push('sz: ' + window.goalCoordinates.sz);
                }

                userInterface.overlays.botOverlay.innerHTML = oContent.join('<br/>');

                if (userInterface.gfxOverlay) {
                    let gContent = [];

                    gContent.push('<b>' + window.snake.nk + '</b>');
                    gContent.push(bot.snakeLength);
                    gContent.push('[' + window.rank + '/' + window.snake_count + ']');

                    userInterface.gfxOverlay.innerHTML = gContent.join('<br/>');
                }

                if (window.bso !== undefined && userInterface.overlays.serverOverlay.innerHTML !== window.bso.ip + ':' + window.bso.po)
                    userInterface.overlays.serverOverlay.innerHTML = window.bso.ip + ':' + window.bso.po;
            }

            if (window.playing && window.visualDebugging) {
                // Only draw the goal when a bot has a goal.
                if (window.goalCoordinates) {
                    var headCoord = { x: window.snake.xx, y: window.snake.yy };
                    var color = bot.goal == "food" ? 'green' : 'yellow';
                    canvas.drawLine(canvas.line(headCoord.x, headCoord.y, window.goalCoordinates.x, window.goalCoordinates.y), color);
                    canvas.drawCircle(window.goalCoordinates, color, true);
                }
            }
        },

        oefTimer: function () {
            var start = Date.now();
            canvas.maintainZoom();
            original_oef();
            if (userInterface.gfxEnabled) {
                original_redraw();
            } else {
                window.visualDebugging = false;
            }

            if (window.playing && (bot.isBotEnabled || window.visualDebugging) && window.snake !== null) {
                window.onmousemove = function () { };  //make mousemove have no effect
                bot.isBotRunning = true;
                bot.go();
            } else if (bot.isBotEnabled && bot.isBotRunning) {  //snake died
                bot.isBotRunning = false;

                if (window.lastscore && window.lastscore.childNodes[1]) {
                    bot.scores.push(parseInt(window.lastscore.childNodes[1].innerHTML));
                    bot.scores.sort(function (a, b) { return b - a; });
                    userInterface.updateStats();
                }

                if (window.autoRespawn)
                    bot.connect();
            }

            if (!bot.isBotEnabled || !bot.isBotRunning)
                window.onmousemove = original_onmousemove;

            userInterface.onFrameUpdate();

            window.raf(userInterface.oefTimer);
        },

        handleTextColor: function (enabled) {
            return '<span style=\"color:' + (enabled ? 'green;\">enabled' : 'red;\">disabled') + '</span>';
        }
    };
})(window, document);

// Main
(function (window, document) {
    window.play_btn.btnf.addEventListener('click', userInterface.playButtonClickListener);
    document.onkeydown = userInterface.onkeydown;
    window.onmousedown = userInterface.onmousedown;
    window.addEventListener('mouseup', userInterface.onmouseup);

    // Hide top score
    userInterface.hideTop();

    // force server
    userInterface.initServerIp();
    userInterface.server.addEventListener('keyup', function (e) {
        if (e.keyCode === 13) {
            e.preventDefault();
            window.play_btn.btnf.click();
        }
    });

    // Overlays
    userInterface.initOverlays();

    // Load preferences
    userInterface.loadPreference('visualDebugging', false);
    userInterface.loadPreference('autoRespawn', false);
    window.nick.value = userInterface.loadPreference('savedNick', '');

    // Listener for mouse wheel scroll - used for setZoom function
    document.body.addEventListener('mousewheel', canvas.setZoom);
    document.body.addEventListener('DOMMouseScroll', canvas.setZoom);

    // Unblocks all skins without the need for FB sharing.
    window.localStorage.setItem('edttsg', '1');

    // Remove social
    window.social.remove();

    // Maintain fps
    setInterval(userInterface.framesPerSecond.fpsTimer, 80);

    // Start!
    userInterface.oefTimer();
})(window, document);
