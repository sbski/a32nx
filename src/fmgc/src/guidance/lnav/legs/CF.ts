// Copyright (c) 2021-2022 FlyByWire Simulations
// Copyright (c) 2021-2022 Synaptic Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { Coordinates } from '@fmgc/flightplanning/data/geo';
import { SegmentType } from '@fmgc/flightplanning/FlightPlanSegment';
import { GuidanceParameters } from '@fmgc/guidance/ControlLaws';
import { courseToFixDistanceToGo, courseToFixGuidance, reciprocal } from '@fmgc/guidance/lnav/CommonGeometry';
import { XFLeg } from '@fmgc/guidance/lnav/legs/XF';
import { LnavConfig } from '@fmgc/guidance/LnavConfig';
import { Transition } from '@fmgc/guidance/lnav/Transition';
import { DmeArcTransition } from '@fmgc/guidance/lnav/transitions/DmeArcTransition';
import { placeBearingDistance } from 'msfs-geo';
import { Waypoint } from 'msfs-navdata';
import { LegMetadata } from '@fmgc/guidance/lnav/legs/index';
import { IFLeg } from '@fmgc/guidance/lnav/legs/IF';
import { PathVector, PathVectorType } from '../PathVector';

export class CFLeg extends XFLeg {
    private computedPath: PathVector[] = [];

    constructor(
        fix: Waypoint,
        public readonly course: DegreesTrue,
        public readonly metadata: Readonly<LegMetadata>,
        segment: SegmentType,
    ) {
        super(fix);

        this.segment = segment;
    }

    getPathStartPoint(): Coordinates | undefined {
        if (this.inboundGuidable instanceof IFLeg) {
            return this.inboundGuidable.fix.location;
        }

        if (this.inboundGuidable instanceof Transition && this.inboundGuidable.isComputed) {
            return this.inboundGuidable.getPathEndPoint();
        }

        if (this.outboundGuidable instanceof DmeArcTransition && this.outboundGuidable.isComputed) {
            return this.outboundGuidable.getPathStartPoint();
        }

        // Estimate where we should start the leg
        return this.estimateStartWithoutInboundTransition();
    }

    /**
     * Based on FBW-22-07
     *
     * @private
     */
    private estimateStartWithoutInboundTransition(): Coordinates {
        return placeBearingDistance(
            this.fix.location,
            reciprocal(this.course),
            this.metadata.flightPlanLegDefinition.length,
        );
    }

    get predictedPath(): PathVector[] {
        return this.computedPath;
    }

    recomputeWithParameters(
        _isActive: boolean,
        _tas: Knots,
        _gs: Knots,
        _ppos: Coordinates,
        _trueTrack: DegreesTrue,
    ) {
        // Is start point after the fix ?
        if (this.overshot) {
            this.computedPath = [{
                type: PathVectorType.Line,
                startPoint: this.getPathEndPoint(),
                endPoint: this.getPathEndPoint(),
            }];
        } else {
            this.computedPath = [{
                type: PathVectorType.Line,
                startPoint: this.getPathStartPoint(),
                endPoint: this.getPathEndPoint(),
            }];
        }

        this.isComputed = true;

        if (LnavConfig.DEBUG_PREDICTED_PATH) {
            this.computedPath.push(
                {
                    type: PathVectorType.DebugPoint,
                    startPoint: this.getPathStartPoint(),
                    annotation: 'CF START',
                },
                {
                    type: PathVectorType.DebugPoint,
                    startPoint: this.getPathEndPoint(),
                    annotation: 'CF END',
                },
            );
        }
    }

    get inboundCourse(): Degrees {
        return this.course;
    }

    get outboundCourse(): Degrees {
        return this.course;
    }

    getDistanceToGo(ppos: Coordinates): NauticalMiles {
        return courseToFixDistanceToGo(ppos, this.course, this.getPathEndPoint());
    }

    getGuidanceParameters(ppos: Coordinates, trueTrack: Degrees, _tas: Knots): GuidanceParameters | undefined {
        return courseToFixGuidance(ppos, trueTrack, this.course, this.getPathEndPoint());
    }

    getNominalRollAngle(_gs: Knots): Degrees {
        return 0;
    }

    isAbeam(ppos: Coordinates): boolean {
        const dtg = courseToFixDistanceToGo(ppos, this.course, this.getPathEndPoint());

        return dtg >= 0 && dtg <= this.distance;
    }

    get repr(): string {
        return `CF(${this.course.toFixed(1)}T) TO ${this.fix.ident}`;
    }
}
