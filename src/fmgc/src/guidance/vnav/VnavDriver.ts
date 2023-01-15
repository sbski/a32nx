//  Copyright (c) 2021 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { TheoreticalDescentPathCharacteristics } from '@fmgc/guidance/vnav/descent/TheoreticalDescentPath';
import { DecelPathBuilder, DecelPathCharacteristics } from '@fmgc/guidance/vnav/descent/DecelPathBuilder';
import { DescentBuilder } from '@fmgc/guidance/vnav/descent/DescentBuilder';
import { VnavConfig } from '@fmgc/guidance/vnav/VnavConfig';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { RequestedVerticalMode, TargetAltitude, TargetVerticalSpeed } from '@fmgc/guidance/ControlLaws';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { VerticalMode } from '@shared/autopilot';
import { CoarsePredictions } from '@fmgc/guidance/vnav/CoarsePredictions';
import { FinalAppGuidance } from '@fmgc/guidance/vnav/FinalApp';
import { FlightPlans } from '@fmgc/flightplanning/FlightPlanManager';
import { Geometry } from '../Geometry';
import { GuidanceComponent } from '../GuidanceComponent';
import { ClimbPathBuilder } from './climb/ClimbPathBuilder';
import { ClimbProfileBuilderResult } from './climb/ClimbProfileBuilderResult';

export class VnavDriver implements GuidanceComponent {
    atmosphericConditions: AtmosphericConditions = new AtmosphericConditions();

    currentClimbProfile: ClimbProfileBuilderResult;

    currentDescentProfile: TheoreticalDescentPathCharacteristics

    currentApproachProfile?: DecelPathCharacteristics;

    private guidanceMode: RequestedVerticalMode;

    private targetVerticalSpeed: TargetVerticalSpeed;

    private targetAltitude: TargetAltitude;

    private finalAppGuidance: FinalAppGuidance;

    // eslint-disable-next-line camelcase
    private coarsePredictionsUpdate = new A32NX_Util.UpdateThrottler(5000);

    constructor(
        private readonly guidanceController: GuidanceController,
    ) {
        this.finalAppGuidance = new FinalAppGuidance();
    }

    init(): void {
        console.log('[FMGC/Guidance] VnavDriver initialized!');
    }

    acceptMultipleLegGeometry(geometry: Geometry) {
        this.computeVerticalProfile(geometry);
    }

    lastCruiseAltitude: Feet = 0;

    update(deltaTime: number): void {
        this.atmosphericConditions.update();

        if (false && this.coarsePredictionsUpdate.canUpdate(deltaTime) !== -1) {
            CoarsePredictions.updatePredictions(this.guidanceController, this.atmosphericConditions);
        }

        const newCruiseAltitude = SimVar.GetSimVarValue('L:AIRLINER_CRUISE_ALTITUDE', 'number');
        if (newCruiseAltitude !== this.lastCruiseAltitude) {
            this.lastCruiseAltitude = newCruiseAltitude;

            if (DEBUG) {
                console.log('[FMS/VNAV] Computed new vertical profile because of new cruise altitude.');
            }

            this.computeVerticalProfile(this.guidanceController.activeGeometry);
        }

        this.updateGuidance();
    }

    private computeVerticalProfile(geometry: Geometry) {
        if (geometry.legs.size > 0) {
            if (VnavConfig.VNAV_CALCULATE_CLIMB_PROFILE) {
                this.currentClimbProfile = ClimbPathBuilder.computeClimbPath(geometry);
            }
            if (this.guidanceController.flightPlanManager.getApproach(FlightPlans.Active)) {
                this.currentApproachProfile = DecelPathBuilder.computeDecelPath(geometry);
            } else {
                this.currentApproachProfile = null;
            }
            this.currentDescentProfile = DescentBuilder.computeDescentPath(geometry, this.currentApproachProfile);

            this.guidanceController.pseudoWaypoints.acceptVerticalProfile();
        } else if (DEBUG) {
            // TODO this should erase the profile??!
            console.warn('[FMS/VNAV] Did not compute vertical profile. Reason: no legs in flight plan.');
        }
    }

    private updateGuidance(): void {
        let newGuidanceMode = RequestedVerticalMode.None;
        let newVerticalSpeed = 0;
        let newAltitude = 0;

        if (this.guidanceController.isManualHoldActive()) {
            const fcuVerticalMode = SimVar.GetSimVarValue('L:A32NX_FMA_VERTICAL_MODE', 'Enum');
            if (fcuVerticalMode === VerticalMode.DES) {
                const holdSpeed = SimVar.GetSimVarValue('L:A32NX_FM_HOLD_SPEED', 'number');
                const atHoldSpeed = this.atmosphericConditions.currentAirspeed <= (holdSpeed + 5);
                if (atHoldSpeed) {
                    newGuidanceMode = RequestedVerticalMode.VsSpeed;
                    newVerticalSpeed = -1000;
                    newAltitude = 0;
                }
            }
        }

        if (this.guidanceController.isManualHoldActive() || this.guidanceController.isManualHoldNext()) {
            let holdSpeedCas = SimVar.GetSimVarValue('L:A32NX_FM_HOLD_SPEED', 'number');
            const holdDecelReached = SimVar.GetSimVarValue('L:A32NX_FM_HOLD_DECEL', 'bool');

            const speedControlManual = Simplane.getAutoPilotAirspeedSelected();
            const isMach = Simplane.getAutoPilotMachModeActive();
            if (speedControlManual && holdDecelReached) {
                if (isMach) {
                    const holdValue = Simplane.getAutoPilotMachHoldValue();
                    holdSpeedCas = this.atmosphericConditions.computeCasFromMach(this.atmosphericConditions.currentAltitude, holdValue);
                } else {
                    holdSpeedCas = Simplane.getAutoPilotAirspeedHoldValue();
                }
            }

            const holdSpeedTas = this.atmosphericConditions.computeTasFromCas(this.atmosphericConditions.currentAltitude, holdSpeedCas);

            this.guidanceController.setHoldSpeed(holdSpeedTas);
        }

        const verticalMode: VerticalMode = SimVar.GetSimVarValue('L:A32NX_FMA_VERTICAL_MODE', 'enum');

        this.finalAppGuidance.update(this.currentApproachProfile, this.guidanceController, verticalMode === VerticalMode.FINAL);

        if (verticalMode === VerticalMode.FINAL) {
            newGuidanceMode = RequestedVerticalMode.VpathSpeed;
            const params = this.finalAppGuidance.getGuidanceParameters(
                this.currentApproachProfile,
                this.guidanceController,
            );
            newAltitude = params.targetAltitude;
            newVerticalSpeed = params.targetVerticalSpeed;
        }

        if (newGuidanceMode !== this.guidanceMode) {
            this.guidanceMode = newGuidanceMode;
            SimVar.SetSimVarValue('L:A32NX_FG_REQUESTED_VERTICAL_MODE', 'number', this.guidanceMode);
        }
        if (newVerticalSpeed !== this.targetVerticalSpeed) {
            this.targetVerticalSpeed = newVerticalSpeed;
            SimVar.SetSimVarValue('L:A32NX_FG_TARGET_VERTICAL_SPEED', 'number', this.targetVerticalSpeed);
        }
        if (newAltitude !== this.targetAltitude) {
            this.targetAltitude = newAltitude;
            SimVar.SetSimVarValue('L:A32NX_FG_TARGET_ALTITUDE', 'number', this.targetAltitude);
        }
    }
}
