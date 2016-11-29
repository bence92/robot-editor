window.states = [];

function steps() {
    for (var i = 0; i < robot_count; i++) {
        step(i);
    }
}

function step(current_robot_index) {
    var canvas = $('canvas');
    var state = window.states[current_robot_index];
    var es = canvas.getLayerGroup(create_start_name(current_robot_index));
    var position = get_start_position(canvas, current_robot_index);
    var active_segment = get_active_segment(state);

    if (active_segment === undefined) {
        stop_following();
        return false;
    }

    var reverse = active_segment.orientation ? 1 : -1;

    canvas.removeLayerGroup(create_projected_name(state.robot_index));

    position.x += reverse * robot.wheelbase * Math.cos(position.rotate);
    position.y += reverse * robot.wheelbase * Math.sin(position.rotate);

    if (active_segment.configIntervalType === 'TCI') {
        var d = closest_point({
            start: {
                x: active_segment.start.x,
                y: active_segment.start.y
            }, end: {
                x: active_segment.end.x,
                y: active_segment.end.y
            }
        }, position);


        canvas.drawEllipse({
            fillStyle: '#f00',
            layer: true,
            groups: [create_projected_name(state.robot_index)],
            x: d.point.x, y: d.point.y,
            width: 5, height: 5
        });
        canvas.drawEllipse({
            fillStyle: '#0f0',
            layer: true,
            groups: [create_projected_name(state.robot_index)],
            x: position.x, y: position.y,
            width: 5, height: 5
        });

        var pos_error = Math.sign(-d.angle_diff) * Math.sqrt(Math.pow(d.point.x - position.x, 2) + Math.pow(d.point.y - position.y, 2));
        var d_error = pos_error - state.last_error;
        state.last_error = pos_error;
        var pos_output = 0.1 * pos_error + 0.1 * d_error;
        var aggregated_output = Math.sign(pos_output) * Math.min(Math.abs(pos_output), 0.5);

        for (var index in es) {
            es[index].rotate += 0.5 * (1.5 * Math.tan(aggregated_output) / window.robot.wheelbase);
            es[index].x += reverse * 1.5 * Math.cos(es[index].rotate);
            es[index].y += reverse * 1.5 * Math.sin(es[index].rotate);
            es[index].rotate += 0.5 * (1.5 * Math.tan(aggregated_output) / window.robot.wheelbase);
        }
        canvas.drawLayers();

        var distance = Math.sqrt(Math.pow(active_segment.end.x - d.point.x, 2) + Math.pow(active_segment.end.y - d.point.y, 2));
        if (distance < 2) {
            determine_active_segment(state);
        }
    } else if (active_segment.configIntervalType === 'ACI') {
        var projected_point = project_point_to_arc(canvas, position, active_segment);

        var center = {
            x: active_segment.center.x,
            y: active_segment.center.y
        };

        var sign = active_segment.direction ? -1 : 1;
        sign *= Math.sign(Math.sqrt(distance_squared(position, center)) - active_segment.radius);


        canvas.drawEllipse({
            fillStyle: '#f00',
            layer: true,
            groups: [create_projected_name(state.robot_index)],
            x: projected_point.x,
            y: projected_point.y,
            width: 5, height: 5
        });
        canvas.drawEllipse({
            fillStyle: '#ff0',
            layer: true,
            groups: [create_projected_name(state.robot_index)],
            x: position.x, y: position.y,
            width: 5, height: 5
        });

        var pos_error = sign * Math.sqrt(Math.pow(projected_point.x - position.x, 2) + Math.pow(projected_point.y - position.y, 2));
        var d_error = pos_error - state.last_error;
        state.last_error = pos_error;
        var pos_output = 0.1 * pos_error + 0.1 * d_error;
        var aggregated_output = Math.sign(pos_output) * Math.min(Math.abs(pos_output), 0.7);

        var alpha = 0.9;
        state.filtered = alpha * state.filtered + (1 - alpha) * aggregated_output;

        for (var index in es) {
            es[index].rotate += 0.5 * (1.5 * Math.tan(state.filtered) / window.robot.wheelbase);
            es[index].x += reverse * 1.5 * Math.cos(es[index].rotate);
            es[index].y += reverse * 1.5 * Math.sin(es[index].rotate);
            es[index].rotate += 0.5 * (1.5 * Math.tan(state.filtered) / window.robot.wheelbase);
        }
        canvas.drawLayers();

        var s = active_segment.center.x + active_segment.radius * Math.cos(active_segment.arc_start + active_segment.delta);
        var e = active_segment.center.y - active_segment.radius * Math.sin(active_segment.arc_start + active_segment.delta);
        var distance = Math.sqrt(Math.pow(s - projected_point.x, 2) + Math.pow(e - projected_point.y, 2));

        if (distance < 2) {
            determine_active_segment(state);
        }
    } else {
        determine_active_segment(state);
    }
}

function drag_robot() {
    var current_robot_index = 0;
    var canvas = $('canvas');
    var state = window.states[current_robot_index];
    var position = get_start_position(canvas, current_robot_index);
    var others = [];
    for (var i=0; i<robot_count; i++) {
        if (i !== current_robot_index) {
            others.push(get_start_position(canvas, i));
        }
    }
    var angle = -position.rotate;

    canvas.removeLayerGroup(create_line_name(state.robot_index));
    for (var i in others){
        var obj = others[i];
        console.log(obj.x + ' ; ' + obj.y + ' @ ' + (-obj.rotate));

        canvas.drawLine({
            strokeStyle: '#f44',
            strokeWidth: 1,
            layer: true,
            groups: [create_line_name(state.robot_index)],
            x1: position.x,
            y1: position.y,
            x2: obj.x1,
            y2: obj.y1
        });
    }

        canvas.drawLayers();
}

function project_point_to_arc(canvas, position, segment) {
    var angle = corrigate_angle2(Math.atan2((-position.y) - (-segment.center.y), position.x - segment.center.x));
    var point = {
        x: segment.center.x + segment.radius * Math.cos(angle),
        y: segment.center.y - segment.radius * Math.sin(angle)
    };
    var point_start = {
        x: segment.center.x + segment.radius * Math.cos(segment.arc_start),
        y: segment.center.y - segment.radius * Math.sin(segment.arc_start)
    };
    var point_end = {
        x: segment.center.x + segment.radius * Math.cos(segment.arc_start + segment.delta),
        y: segment.center.y - segment.radius * Math.sin(segment.arc_start + segment.delta)
    };
    var distance_from_start = corrigate_angle2(Math.atan2((-point.y) - (-segment.center.y), point.x - segment.center.x) - segment.arc_start);

    var is_between = false;
    if (segment.direction) {  // ccw
        is_between = Math.abs(distance_from_start) <= Math.abs(segment.delta);
    } else {  // cw
        is_between = Math.abs(distance_from_start) >= (2 * Math.PI - Math.abs(segment.delta));
    }

    if (is_between) {
        return point;
    } else {
        if (segment.direction) {
            if (Math.abs((2 * Math.PI) - distance_from_start) < Math.abs(distance_from_start - segment.delta)) {
                return point_start;
            } else {
                return point_end;
            }
        } else {
            if (Math.abs((2 * Math.PI) - distance_from_start) > Math.abs(distance_from_start - segment.delta)) {
                return point_start;
            } else {
                return point_end;
            }
        }
    }
}

function get_active_segment(state) {
    var active_segment = window.paths[state.robot_index].segments[state.active_segment_index];

    if (state.overrun_segment !== null) {
        if (active_segment.configIntervalType === 'TCI') {
            return construct_overrun_from_TCI(active_segment, state);
        } else {
            return construct_overrun_from_ACI(active_segment, state);
        }
    } else {
        return active_segment;
    }
}

function construct_overrun_from_TCI(segment, state) {
    canvas = $('canvas');
    var start = {x: segment.start.x, y: segment.start.y};
    var end = {x: segment.end.x, y: segment.end.y};
    var segment_vector = subtract(end, start);
    var line_angle = -1 * Math.atan2(segment_vector.y, segment_vector.x);

    var new_end = {
        x: segment.end.x + window.robot.wheelbase * Math.cos(line_angle),
        y: segment.end.y - window.robot.wheelbase * Math.sin(line_angle)
    };

    var segm = {
        configIntervalType: "TCI",
        arc_start: 0,
        delta: 0,
        direction: segment.direction,
        orientation: segment.orientation,
        radius: 0,
        center: {x: 0, y: 0},
        start: end,
        end: new_end
    };

    canvas.removeLayerGroup(create_segment_name(state.robot_index));
    canvas.drawLine({
        strokeStyle: '#f44',
        strokeWidth: 1,
        layer: true,
        endArrow: true,
        arrowRadius: 7,
        arrowAngle: 1,
        groups: [create_segment_name(state.robot_index)],
        x1: segm.start.x,
        y1: segm.start.y,
        x2: segm.end.x,
        y2: segm.end.y
    });
    canvas.drawLayers();

    return segm;
}

function construct_overrun_from_ACI(segment, state) {
    var multiplier = segment.direction ? -1 : 1;
    var a = multiplier * (segment.arc_start + segment.delta);
    var end_point = {
        x: segment.center.x + segment.radius * Math.cos(a),
        y: segment.center.y - multiplier *  segment.radius * Math.sin(a)
    };
    var center = {
        x: segment.center.x,
        y: segment.center.y,
    };
    var diff = segment.direction ? subtract(end_point, center) : subtract(center, end_point);
    var line_angle = Math.atan2(-diff.x, diff.y);

    var new_end = {
        x: end_point.x + window.robot.wheelbase * Math.cos(-line_angle),
        y: end_point.y - window.robot.wheelbase * Math.sin(-line_angle)
    };

    var segm = {
        configIntervalType: "TCI",
        arc_start: 0,
        delta: 0,
        direction: segment.direction,
        orientation: segment.orientation,
        radius: 0,
        center: {x: 0, y: 0},
        start: end_point,
        end: new_end
    };

    canvas.removeLayerGroup(create_segment_name(state.robot_index));
    canvas.drawLine({
        strokeStyle: '#f44',
        strokeWidth: 1,
        layer: true,
        endArrow: true,
        arrowRadius: 7,
        arrowAngle: 1,
        groups: [create_segment_name(state.robot_index)],
        x1: segm.start.x,
        y1: segm.start.y,
        x2: segm.end.x,
        y2: segm.end.y
    });
    canvas.drawLayers();

    return segm;
}

function determine_active_segment(state) {
    state.last_error = null;

    if (state.overrun_segment !== null) {
        state.overrun_segment = null;
        state.active_segment_index += 1;
    } else {
        var next_index = state.active_segment_index + 1;

        if (window.paths[state.robot_index].segments.length <= next_index) {
            state.overrun_segment = state.active_segment_index;
        } else if (window.paths[state.robot_index].segments[next_index].orientation !== window.paths[state.robot_index].segments[state.active_segment_index].orientation) {
            state.overrun_segment = state.active_segment_index;
        } else {
            state.active_segment_index += 1;
        }
    }
}

function start_following() {
    reset_state();
    window.path_follower_interval = setInterval(steps, 30);
    $('#start-button').unbind('click').on('click', stop_following).text('Stop');
}

function stop_following() {
    clearInterval(window.path_follower_interval);
    $('#start-button').unbind('click').on('click', start_following).text('Start');
}

function reset_state() {
    window.states = [];
    for (var i = 0; i < robot_count; i++) {
        window.states[i] = {
            robot_index: i,
            active_segment_index: 0,
            overrun_segment: null,
            last_error: null,
            filtered: 0
        };
    }
}
