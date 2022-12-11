// Copyright (c) 2021-2022 FlyByWire Simulations
// Copyright (c) 2021-2022 Synaptic Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { Airport } from 'msfs-navdata';
import { AlternateFlightPlan } from '@fmgc/flightplanning/new/plans/AlternateFlightPlan';
import { PendingAirways } from '@fmgc/flightplanning/new/plans/PendingAirways';
import { EventBus } from 'msfssdk';
import { FixInfoEntry } from '@fmgc/flightplanning/new/plans/FixInfo';
import { FlightPlanPerformanceData } from './performance/FlightPlanPerformanceData';
import { BaseFlightPlan } from './BaseFlightPlan';

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

    clone(): FlightPlan {
        const newPlan = FlightPlan.empty(this.index, this.bus);

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

    async setAlternateDestinationAirport(icao: string) {
        return this.alternateFlightPlan.setDestinationAirport(icao);
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

    setFixInfoEntry(index: 1 | 2 | 3 | 4, fixInfo: FixInfoEntry | null): void {
        const planFixInfo = this.fixInfos as FixInfoEntry[];

        planFixInfo[index] = fixInfo;

        this.sendEvent('flightPlan.setFixInfoEntry', { planIndex: this.index, index, fixInfo });
        this.incrementVersion();
    }

    editFixInfoEntry(index: 1 | 2 | 3 | 4, callback: (fixInfo: FixInfoEntry) => FixInfoEntry): void {
        const planFixInfo = this.fixInfos as FixInfoEntry[];

        const res = callback(planFixInfo[index]);

        if (res) {
            planFixInfo[index] = res;
        }

        this.sendEvent('flightPlan.setFixInfoEntry', { planIndex: this.index, index, fixInfo: res });
        this.incrementVersion();
    }
}
