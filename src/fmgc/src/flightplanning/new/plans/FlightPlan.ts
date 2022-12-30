// Copyright (c) 2021-2022 FlyByWire Simulations
// Copyright (c) 2021-2022 Synaptic Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { Airport, Waypoint } from 'msfs-navdata';
import { AlternateFlightPlan } from '@fmgc/flightplanning/new/plans/AlternateFlightPlan';
import { PendingAirways } from '@fmgc/flightplanning/new/plans/PendingAirways';
import { EventBus } from 'msfssdk';
import { FixInfoEntry } from '@fmgc/flightplanning/new/plans/FixInfo';
import { loadAllDepartures, loadAllRunways } from '@fmgc/flightplanning/new/DataLoading';
import { Coordinates, Degrees } from 'msfs-geo';
import { MagVar } from '@shared/MagVar';
import { FlightPlanLeg, FlightPlanLegFlags } from '@fmgc/flightplanning/new/legs/FlightPlanLeg';
import { FlightPlanPerformanceData } from './performance/FlightPlanPerformanceData';
import { BaseFlightPlan, FlightPlanQueuedOperation } from './BaseFlightPlan';

export class FlightPlan extends BaseFlightPlan {
    static empty(index: number, bus: EventBus): FlightPlan {
        return new FlightPlan(index, bus);
    }

    /**
     * Alternate flight plan associated with this flight plan
     */
    alternateFlightPlan = new AlternateFlightPlan(this.index, this);

    pendingAirways: PendingAirways | undefined;

    /**
     * Performance data for this flight plan
     */
    performanceData = new FlightPlanPerformanceData();

    /**
     * FIX INFO entries
     */
    fixInfos: readonly FixInfoEntry[] = [];

    clone(newIndex: number): FlightPlan {
        const newPlan = FlightPlan.empty(newIndex, this.bus);

        newPlan.version = this.version;
        newPlan.originSegment = this.originSegment.clone(newPlan);
        newPlan.departureRunwayTransitionSegment = this.departureRunwayTransitionSegment.clone(newPlan);
        newPlan.departureSegment = this.departureSegment.clone(newPlan);
        newPlan.departureEnrouteTransitionSegment = this.departureEnrouteTransitionSegment.clone(newPlan);
        newPlan.enrouteSegment = this.enrouteSegment.clone(newPlan);
        newPlan.arrivalEnrouteTransitionSegment = this.arrivalEnrouteTransitionSegment.clone(newPlan);
        newPlan.arrivalSegment = this.arrivalSegment.clone(newPlan);
        newPlan.arrivalRunwayTransitionSegment = this.arrivalRunwayTransitionSegment.clone(newPlan);
        newPlan.approachViaSegment = this.approachViaSegment.clone(newPlan);
        newPlan.approachSegment = this.approachSegment.clone(newPlan);
        newPlan.destinationSegment = this.destinationSegment.clone(newPlan);
        newPlan.missedApproachSegment = this.missedApproachSegment.clone(newPlan);

        newPlan.alternateFlightPlan = this.alternateFlightPlan.clone(newPlan);

        newPlan.availableOriginRunways = [...this.availableOriginRunways];
        newPlan.availableDepartures = [...this.availableDepartures];
        newPlan.availableDestinationRunways = [...this.availableDestinationRunways];
        newPlan.availableArrivals = [...this.availableArrivals];
        newPlan.availableApproaches = [...this.availableApproaches];
        newPlan.availableApproachVias = [...this.availableApproachVias];

        newPlan.activeLegIndex = this.activeLegIndex;
        // TODO copy performance data as well (only for SEC F-PLN)

        return newPlan;
    }

    get alternateDestinationAirport(): Airport {
        return this.alternateFlightPlan.destinationAirport;
    }

    async setAlternateDestinationAirport(icao: string | undefined) {
        await this.alternateFlightPlan.setDestinationAirport(icao);

        if (this.alternateFlightPlan.originAirport) {
            this.alternateFlightPlan.availableOriginRunways = await loadAllRunways(this.alternateFlightPlan.originAirport);
            this.alternateFlightPlan.availableDepartures = await loadAllDepartures(this.alternateFlightPlan.originAirport);
        }

        await this.alternateFlightPlan.originSegment.refreshOriginLegs();

        this.alternateFlightPlan.incrementVersion();
    }

    deleteAlternateFlightPlan() {
        this.setAlternateDestinationAirport(undefined);

        this.alternateFlightPlan.setOriginRunway(undefined);
        this.alternateFlightPlan.setDeparture(undefined);
        this.alternateFlightPlan.setDepartureEnrouteTransition(undefined);
        this.alternateFlightPlan.setArrivalEnrouteTransition(undefined);
        this.alternateFlightPlan.setArrival(undefined);
        this.alternateFlightPlan.setApproach(undefined);
        this.alternateFlightPlan.setApproachVia(undefined);

        this.alternateFlightPlan.allLegs.length = 0;

        this.alternateFlightPlan.incrementVersion();
    }

    directTo(ppos: Coordinates, trueTrack: Degrees, waypoint: Waypoint, withAbeam = false) {
        // TODO withAbeam
        // TODO handle direct-to into the alternate (make alternate active...?

        const targetLeg = this.allLegs.find((it) => it.isDiscontinuity === false && it.terminatesWithWaypoint(waypoint));
        const targetLegIndex = this.allLegs.findIndex((it) => it === targetLeg);

        if (targetLeg.isDiscontinuity === true || !targetLeg.isXF()) {
            throw new Error('[FPM] Target leg of a direct to cannot be a discontinuity or non-XF leg');
        }

        const magVar = MagVar.getMagVar(ppos);
        const magneticCourse = MagVar.trueToMagnetic(trueTrack, magVar);

        const turningPoint = FlightPlanLeg.turningPoint(this.enrouteSegment, ppos, magneticCourse);
        const turnEnd = FlightPlanLeg.directToTurnEnd(this.enrouteSegment, targetLeg.definition.waypoint);

        turningPoint.flags |= FlightPlanLegFlags.DirectToTurningPoint;

        this.redistributeLegsAt(targetLegIndex);

        const indexInEnrouteSegment = this.enrouteSegment.allLegs.findIndex((it) => it === targetLeg);

        if (indexInEnrouteSegment === -1) {
            throw new Error('[FPM] Target leg of a direct to not found in enroute segment after leg redistribution!');
        }

        this.enrouteSegment.allLegs.splice(indexInEnrouteSegment, 0, { isDiscontinuity: true });
        this.enrouteSegment.allLegs.splice(indexInEnrouteSegment + 1, 0, turningPoint);
        this.enrouteSegment.allLegs.splice(indexInEnrouteSegment + 2, 0, turnEnd);
        this.enrouteSegment.allLegs.splice(indexInEnrouteSegment + 3, 1);
        this.incrementVersion();

        const turnStartLegIndexInPlan = this.allLegs.findIndex((it) => it === turnEnd);

        this.activeLegIndex = turnStartLegIndexInPlan;

        this.incrementVersion();
    }

    enableAltn(atIndexInAlternate: number) {
        if (!this.alternateDestinationAirport) {
            throw new Error('[FMS/FPM] Cannot enable alternate with no alternate destination defined');
        }

        this.redistributeLegsAt(this.activeLegIndex);

        this.removeRange(this.activeLegIndex + 1, this.legCount);
        this.incrementVersion();

        this.enrouteSegment.allLegs.push({ isDiscontinuity: true });

        const altnLegs = this.alternateFlightPlan.allLegs.slice(atIndexInAlternate, this.alternateFlightPlan.legCount);

        // TODO correctly place shit in segments

        for (const leg of altnLegs) {
            if (leg.isDiscontinuity === false) {
                const newLeg = FlightPlanLeg.deserialize(leg.serialize(), this.enrouteSegment);

                this.enrouteSegment.allLegs.push(newLeg);
            } else {
                this.enrouteSegment.allLegs.push({ isDiscontinuity: true });
            }
        }

        this.deleteAlternateFlightPlan();

        this.enqueueOperation(FlightPlanQueuedOperation.Restring);
        this.flushOperationQueue();
    }

    startAirwayEntry(revisedLegIndex: number) {
        const leg = this.elementAt(revisedLegIndex);

        if (leg.isDiscontinuity === true) {
            throw new Error('Cannot start airway entry at a discontinuity');
        }

        if (!leg.isXF() && !leg.isHX()) {
            throw new Error('Cannot create a pending airways entry from a non XF or HX leg');
        }

        this.pendingAirways = new PendingAirways(this, revisedLegIndex, leg);
    }

    setFixInfoEntry(index: 1 | 2 | 3 | 4, fixInfo: FixInfoEntry | null, notify = true): void {
        const planFixInfo = this.fixInfos as FixInfoEntry[];

        planFixInfo[index] = fixInfo;

        if (notify) {
            this.sendEvent('flightPlan.setFixInfoEntry', { planIndex: this.index, forAlternate: false, index, fixInfo });
        }

        this.incrementVersion();
    }

    editFixInfoEntry(index: 1 | 2 | 3 | 4, callback: (fixInfo: FixInfoEntry) => FixInfoEntry, notify = true): void {
        const planFixInfo = this.fixInfos as FixInfoEntry[];

        const res = callback(planFixInfo[index]);

        if (res) {
            planFixInfo[index] = res;
        }

        if (notify) {
            this.sendEvent('flightPlan.setFixInfoEntry', { planIndex: this.index, forAlternate: false, index, fixInfo: res });
        }

        this.incrementVersion();
    }
}
