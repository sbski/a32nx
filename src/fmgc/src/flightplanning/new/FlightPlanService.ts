// Copyright (c) 2021-2022 FlyByWire Simulations
// Copyright (c) 2021-2022 Synaptic Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { FlightPlanIndex, FlightPlanManager } from '@fmgc/flightplanning/new/FlightPlanManager';
import { FpmConfig, FpmConfigs } from '@fmgc/flightplanning/new/FpmConfig';
import { FlightPlanLeg } from '@fmgc/flightplanning/new/legs/FlightPlanLeg';
import { Waypoint } from 'msfs-navdata';
import { NavigationDatabase } from '@fmgc/NavigationDatabase';
import { Coordinates } from 'msfs-geo';
import { EventBus } from 'msfssdk';
import { MagVar } from '@shared/MagVar';
import { FixInfoEntry } from '@fmgc/flightplanning/new/plans/FixInfo';

export class FlightPlanService {
    private constructor() {
    }

    private static flightPlanManager = new FlightPlanManager(new EventBus(), Math.round(Math.random() * 10_000));

    private static config: FpmConfig = FpmConfigs.A320_HONEYWELL_H3

    static navigationDatabase: NavigationDatabase

    static version = 0;

    static createFlightPlans() {
        this.flightPlanManager.create(0);
        this.flightPlanManager.create(1);
        this.flightPlanManager.create(2);
        this.flightPlanManager.create(3);
    }

    static has(index: number) {
        return this.flightPlanManager.has(index);
    }

    static get active() {
        return this.flightPlanManager.get(FlightPlanIndex.Active);
    }

    static get temporary() {
        return this.flightPlanManager.get(FlightPlanIndex.Temporary);
    }

    static get activeOrTemporary() {
        if (this.hasTemporary) {
            return this.flightPlanManager.get(FlightPlanIndex.Temporary);
        }
        return this.flightPlanManager.get(FlightPlanIndex.Active);
    }

    static get uplink() {
        return this.flightPlanManager.get(FlightPlanIndex.Uplink);
    }

    /**
     * Obtains the specified secondary flight plan, 1-indexed
     */
    static secondary(index: number) {
        return this.flightPlanManager.get(FlightPlanIndex.FirstSecondary + index - 1);
    }

    static get hasActive() {
        return this.flightPlanManager.has(FlightPlanIndex.Active);
    }

    static get hasTemporary() {
        return this.flightPlanManager.has(FlightPlanIndex.Temporary);
    }

    static hasSecondary(index: number) {
        return this.flightPlanManager.has(FlightPlanIndex.FirstSecondary + index - 1);
    }

    static get hasUplink() {
        return this.flightPlanManager.has(FlightPlanIndex.Uplink);
    }

    static temporaryInsert() {
        const temporaryPlan = this.flightPlanManager.get(FlightPlanIndex.Temporary);

        if (temporaryPlan.pendingAirways) {
            temporaryPlan.pendingAirways.finalize();
        }

        this.flightPlanManager.copy(FlightPlanIndex.Temporary, FlightPlanIndex.Active);
        this.flightPlanManager.delete(FlightPlanIndex.Temporary);
    }

    static temporaryDelete() {
        if (!this.hasTemporary) {
            throw new Error('[FMS/FPS] Cannot delete temporary flight plan if none exists');
        }

        this.flightPlanManager.delete(FlightPlanIndex.Temporary);
    }

    static uplinkInsert() {
        if (!this.hasUplink) {
            throw new Error('[FMS/FPS] Cannot insert uplink flight plan if none exists');
        }

        this.flightPlanManager.copy(FlightPlanIndex.Uplink, FlightPlanIndex.Active);
        this.flightPlanManager.delete(FlightPlanIndex.Uplink);
        this.flightPlanManager.delete(FlightPlanIndex.Temporary);
    }

    static reset() {
        this.flightPlanManager.deleteAll();
    }

    private static prepareDestructiveModification(planIndex: FlightPlanIndex) {
        let finalIndex = planIndex;
        if (planIndex === FlightPlanIndex.Active) {
            this.ensureTemporaryExists();

            finalIndex = FlightPlanIndex.Temporary;
        }

        return finalIndex;
    }

    /**
     * Resets the flight plan with a new FROM/TO/ALTN city pair
     *
     * @param fromIcao  ICAO of the FROM airport
     * @param toIcao    ICAO of the TO airport
     * @param altnIcao  ICAO of the ALTN airport
     * @param planIndex which flight plan (excluding temporary) to make the change on
     */
    static async newCityPair(fromIcao: string, toIcao: string, altnIcao?: string, planIndex = FlightPlanIndex.Active) {
        if (planIndex === FlightPlanIndex.Temporary) {
            throw new Error('[FMS/FPM] Cannot enter new city pair on temporary flight plan');
        }

        if (planIndex === FlightPlanIndex.Active && this.flightPlanManager.has(FlightPlanIndex.Temporary)) {
            this.flightPlanManager.delete(FlightPlanIndex.Temporary);
        }

        if (this.flightPlanManager.has(planIndex)) {
            this.flightPlanManager.delete(planIndex);
        }
        this.flightPlanManager.create(planIndex);

        await this.flightPlanManager.get(planIndex).setOriginAirport(fromIcao);
        await this.flightPlanManager.get(planIndex).setDestinationAirport(toIcao);
        if (altnIcao) {
            await this.flightPlanManager.get(planIndex).setAlternateDestinationAirport(altnIcao);
        }
    }

    /**
     * Sets the origin runway in the flight plan. Creates a temporary flight plan if target is active.
     *
     * @param runwayIdent the runway identifier (e.g., RW27C)
     * @param planIndex   which flight plan to make the change on
     */
    static setOriginRunway(runwayIdent: string, planIndex = FlightPlanIndex.Active) {
        const finalIndex = this.prepareDestructiveModification(planIndex);

        return this.flightPlanManager.get(finalIndex).setOriginRunway(runwayIdent);
    }

    /**
     * Sets the departure procedure in the flight plan. Creates a temporary flight plan if target is active.
     *
     * @param procedureIdent the procedure identifier (e.g., BAVE6P)
     * @param planIndex      which flight plan to make the change on
     */
    static setDepartureProcedure(procedureIdent: string | undefined, planIndex = FlightPlanIndex.Active) {
        const finalIndex = this.prepareDestructiveModification(planIndex);

        return this.flightPlanManager.get(finalIndex).setDeparture(procedureIdent);
    }

    /**
     * Sets the departure enroute transition procedure in the flight plan. Creates a temporary flight plan if target is active.
     *
     * @param transitionIdent the enroute transition identifier (e.g., KABIN)
     * @param planIndex       which flight plan to make the change on
     */
    static setDepartureEnrouteTransition(transitionIdent: string | undefined, planIndex = FlightPlanIndex.Active) {
        const finalIndex = this.prepareDestructiveModification(planIndex);

        return this.flightPlanManager.get(finalIndex).setDepartureEnrouteTransition(transitionIdent);
    }

    /**
     * Sets the arrival enroute transition procedure in the flight plan. Creates a temporary flight plan if target is active.
     *
     * @param transitionIdent the enroute transition identifier (e.g., PLYMM)
     * @param planIndex       which flight plan to make the change on
     */
    static setArrivalEnrouteTransition(transitionIdent: string | undefined, planIndex = FlightPlanIndex.Active) {
        const finalIndex = this.prepareDestructiveModification(planIndex);

        return this.flightPlanManager.get(finalIndex).setArrivalEnrouteTransition(transitionIdent);
    }

    /**
     * Sets the arrival procedure in the flight plan. Creates a temporary flight plan if target is active.
     *
     * @param procedureIdent the procedure identifier (e.g., BOXUM5)
     * @param planIndex      which flight plan to make the change on
     */
    static setArrival(procedureIdent: string | undefined, planIndex = FlightPlanIndex.Active) {
        const finalIndex = this.prepareDestructiveModification(planIndex);

        return this.flightPlanManager.get(finalIndex).setArrival(procedureIdent);
    }

    /**
     * Sets the approach via in the flight plan. Creates a temporary flight plan if target is active.
     *
     * @param procedureIdent the procedure identifier (e.g., DIREX)
     * @param planIndex      which flight plan to make the change on
     */
    static setApproachVia(procedureIdent: string | undefined, planIndex = FlightPlanIndex.Active) {
        const finalIndex = this.prepareDestructiveModification(planIndex);

        return this.flightPlanManager.get(finalIndex).setApproachVia(procedureIdent);
    }

    /**
     * Sets the approach procedure in the flight plan. Creates a temporary flight plan if target is active.
     *
     * @param procedureIdent the procedure identifier (e.g., R05-X)
     * @param planIndex      which flight plan to make the change on
     */
    static setApproach(procedureIdent: string | undefined, planIndex = FlightPlanIndex.Active) {
        const finalIndex = this.prepareDestructiveModification(planIndex);

        return this.flightPlanManager.get(finalIndex).setApproach(procedureIdent);
    }

    /**
     * Sets the origin runway in the flight plan. Creates a temporary flight plan if target is active.
     *
     * @param runwayIdent the runway identifier (e.g., RW27C)
     * @param planIndex   which flight plan to make the change on
     */
    static setDestinationRunway(runwayIdent: string, planIndex = FlightPlanIndex.Active) {
        const finalIndex = this.prepareDestructiveModification(planIndex);

        return this.flightPlanManager.get(finalIndex).setDestinationRunway(runwayIdent);
    }

    /**
     * Deletes an element (leg or discontinuity) at the specified index. Depending on the {@link FpmConfig} in use,
     * this can create a temporary flight plan if target is active.
     *
     * @param index     the index of the element to delete
     * @param planIndex which flight plan to make the change on
     *
     * @returns `true` if the element could be removed, `false` if removal is not allowed
     */
    static deleteElementAt(index: number, planIndex = FlightPlanIndex.Active): boolean {
        if (!this.config.ALLOW_REVISIONS_ON_TMPY && planIndex === FlightPlanIndex.Temporary) {
            throw new Error('[FMS/FPS] Cannot delete element in temporary flight plan');
        }

        let finalIndex: number = planIndex;
        if (this.config.TMPY_ON_DELETE_WAYPOINT) {
            finalIndex = this.prepareDestructiveModification(planIndex);
        }

        return this.flightPlanManager.get(finalIndex).removeElementAt(index);
    }

    static nextWaypoint(atIndex: number, waypoint: Waypoint, planIndex = FlightPlanIndex.Active) {
        const finalIndex = this.prepareDestructiveModification(planIndex);

        const plan = this.flightPlanManager.get(finalIndex);

        const leg = FlightPlanLeg.fromEnrouteWaypoint(plan.enrouteSegment, waypoint);

        this.flightPlanManager.get(finalIndex).insertElementAfter(atIndex, leg);
    }

    static startAirwayEntry(at: number, planIndex = FlightPlanIndex.Active) {
        const finalIndex = this.prepareDestructiveModification(planIndex);

        const plan = this.flightPlanManager.get(finalIndex);

        plan.startAirwayEntry(at);
    }

    static directTo(ppos: Coordinates, trueTrack: Degrees, waypoint: Waypoint, planIndex = FlightPlanIndex.Active) {
        const finalIndex = this.prepareDestructiveModification(planIndex);

        const plan = this.flightPlanManager.get(finalIndex);

        const targetLeg = plan.allLegs.find((it) => it.isDiscontinuity === false && it.terminatesWithWaypoint(waypoint));
        const targetLegIndex = plan.allLegs.findIndex((it) => it === targetLeg);

        if (targetLeg.isDiscontinuity === true || !targetLeg.isXF()) {
            throw new Error('[FPM] Target leg of a direct to cannot be a discontinuity or non-XF leg');
        }

        const magVar = MagVar.getMagVar(ppos);
        const magneticCourse = MagVar.trueToMagnetic(trueTrack, magVar);

        const turningPoint = FlightPlanLeg.turningPoint(plan.enrouteSegment, ppos, magneticCourse);
        const turnEnd = FlightPlanLeg.directToTurnEnd(plan.enrouteSegment, targetLeg.definition.waypoint);

        // TODO maybe encapsulate this behaviour in BaseFlightPlan
        plan.redistributeLegsAt(targetLegIndex);
        const indexInEnrouteSegment = plan.enrouteSegment.allLegs.findIndex((it) => it === targetLeg);

        plan.enrouteSegment.allLegs.splice(indexInEnrouteSegment, 0, { isDiscontinuity: true });
        plan.enrouteSegment.allLegs.splice(indexInEnrouteSegment + 1, 0, turningPoint);
        plan.enrouteSegment.allLegs.splice(indexInEnrouteSegment + 2, 0, turnEnd);
        plan.enrouteSegment.allLegs.splice(indexInEnrouteSegment + 3, 1);
        plan.incrementVersion();

        const turnStartLegIndexInPlan = plan.allLegs.findIndex((it) => it === turnEnd);

        plan.activeLegIndex = turnStartLegIndexInPlan;
        plan.incrementVersion();
    }

    static setOverfly(atIndex: number, overfly: boolean, planIndex = FlightPlanIndex.Active) {
        let finalIndex: number = planIndex;
        if (this.config.TMPY_ON_OVERFLY) {
            finalIndex = this.prepareDestructiveModification(planIndex);
        }

        const plan = this.flightPlanManager.get(finalIndex);

        return plan.setOverflyAt(atIndex, overfly);
    }

    static toggleOverfly(atIndex: number, planIndex = FlightPlanIndex.Active) {
        let finalIndex: number = planIndex;
        if (this.config.TMPY_ON_OVERFLY) {
            finalIndex = this.prepareDestructiveModification(planIndex);
        }

        const plan = this.flightPlanManager.get(finalIndex);

        return plan.toggleOverflyAt(atIndex);
    }

    static setFixInfoEntry(index: 1 | 2 | 3 | 4, fixInfo: FixInfoEntry | null, planIndex = FlightPlanIndex.Active) {
        if (!this.config.ALLOW_NON_ACTIVE_FIX_INFOS && planIndex !== FlightPlanIndex.Active) {
            throw new Error('FIX INFO can only be modified on the active flight plan');
        }

        const plan = this.flightPlanManager.get(planIndex);

        plan.setFixInfoEntry(index, fixInfo);
    }

    static editFixInfoEntry(index: 1 | 2 | 3 | 4, callback: (fixInfo: FixInfoEntry) => FixInfoEntry, planIndex = FlightPlanIndex.Active) {
        if (!this.config.ALLOW_NON_ACTIVE_FIX_INFOS && planIndex !== FlightPlanIndex.Active) {
            throw new Error('FIX INFO can only be modified on the active flight plan');
        }

        const plan = this.flightPlanManager.get(planIndex);

        plan.editFixInfoEntry(index, callback);
    }

    static get activeLegIndex(): number {
        return this.active.activeLegIndex;
    }

    private static ensureTemporaryExists() {
        if (this.hasTemporary) {
            return;
        }

        this.flightPlanManager.copy(FlightPlanIndex.Active, FlightPlanIndex.Temporary);
    }

    // static insertDirectTo(directTo: DirectTo): Promise<void> {
    //     if (!this.hasActive) {
    //         throw new Error('[FMS/FPM] DirectTo cannot be done without active flight plan');
    //     }
    //
    //     if ((directTo.flightPlanLegIndex === undefined || directTo.flightPlanLegIndex === null) && !directTo.nonFlightPlanWaypoint) {
    //         throw new Error('[FMS/FPM] DirectTo must have either flightPlanLegIndex or nonFlightPlanWaypoint');
    //     }
    //
    //     if (directTo.flightPlanLegIndex !== undefined && directTo.flightPlanLegIndex !== null && directTo.nonFlightPlanWaypoint) {
    //         throw new Error('[FMS/FPM] DirectTo cannot have both flightPlanLegIndex and nonFlightPlanWaypoint');
    //     }
    //
    //     if (directTo.nonFlightPlanWaypoint) {
    //         const dfLeg = FlightPlanLeg.fromEnrouteWaypoint(this.active.enrouteSegment, directTo.nonFlightPlanWaypoint);
    //         dfLeg.type = LegType.DF;
    //
    //         this.active.insertWaypointAfter(this.active.activeLegIndex, directTo.nonFlightPlanWaypoint);
    //     }
    // }
}
