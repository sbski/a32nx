import { RequestedVerticalMode, TargetAltitude, TargetVerticalSpeed } from '@fmgc/guidance/ControlLaws';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { AircraftToDescentProfileRelation } from '@fmgc/guidance/vnav/descent/AircraftToProfileRelation';
import { NavGeometryProfile } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { VerticalMode } from '@shared/autopilot';
import { FmgcFlightPhase } from '@shared/flightphase';
import { SpeedMargin } from './SpeedMargin';
import { TodGuidance } from './TodGuidance';

enum DescentVerticalGuidanceState {
    InvalidProfile,
    ProvidingGuidance,
    Observing
}

enum DescentSpeedGuidanceState {
    NotInDescentPhase,
    TargetOnly,
    TargetAndMargins,
}

export class DescentGuidance {
    private verticalState: DescentVerticalGuidanceState = DescentVerticalGuidanceState.InvalidProfile;

    private speedState: DescentSpeedGuidanceState = DescentSpeedGuidanceState.NotInDescentPhase;

    private requestedVerticalMode: RequestedVerticalMode = RequestedVerticalMode.None;

    private targetAltitude: TargetAltitude = 0;

    private targetAltitudeGuidance: TargetAltitude = 0;

    private targetVerticalSpeed: TargetVerticalSpeed = 0;

    private showLinearDeviationOnPfd: boolean = false;

    private showDescentLatchOnPfd: boolean = false;

    private speedMargin: SpeedMargin;

    private todGuidance: TodGuidance;

    private speedTarget: Knots | Mach;

    // An "overspeed condition" just means we are above the speed margins, not that we are in the red band.
    // We use a boolean here for hysteresis
    private isInOverspeedCondition: boolean = false;

    private isInUnderspeedCondition: boolean = false;

    constructor(
        private guidanceController: GuidanceController,
        private aircraftToDescentProfileRelation: AircraftToDescentProfileRelation,
        private observer: VerticalProfileComputationParametersObserver,
        private atmosphericConditions: AtmosphericConditions,
    ) {
        this.speedMargin = new SpeedMargin(this.observer);
        this.todGuidance = new TodGuidance(this.aircraftToDescentProfileRelation, this.observer, this.atmosphericConditions);

        this.writeToSimVars();
    }

    updateProfile(profile: NavGeometryProfile) {
        this.aircraftToDescentProfileRelation.updateProfile(profile);

        if (!this.aircraftToDescentProfileRelation.isValid) {
            this.changeState(DescentVerticalGuidanceState.InvalidProfile);
        }
    }

    private changeState(newState: DescentVerticalGuidanceState) {
        if (this.verticalState === newState) {
            return;
        }

        if (this.verticalState !== DescentVerticalGuidanceState.InvalidProfile && newState === DescentVerticalGuidanceState.InvalidProfile) {
            this.reset();
            this.writeToSimVars();
        }

        this.verticalState = newState;
    }

    private reset() {
        this.requestedVerticalMode = RequestedVerticalMode.None;
        this.targetAltitude = 0;
        this.targetVerticalSpeed = 0;
        this.showLinearDeviationOnPfd = false;
        this.showDescentLatchOnPfd = false;
        this.isInOverspeedCondition = false;
    }

    update(deltaTime: number, distanceToEnd: NauticalMiles) {
        this.aircraftToDescentProfileRelation.update(distanceToEnd);

        if (!this.aircraftToDescentProfileRelation.isValid) {
            return;
        }

        if ((this.observer.get().fcuVerticalMode === VerticalMode.DES) !== (this.verticalState === DescentVerticalGuidanceState.ProvidingGuidance)) {
            this.changeState(this.verticalState === DescentVerticalGuidanceState.ProvidingGuidance ? DescentVerticalGuidanceState.Observing : DescentVerticalGuidanceState.ProvidingGuidance);
        }

        this.updateSpeedMarginState();
        this.updateSpeedTarget();
        this.updateSpeedGuidance();
        this.updateOverUnderspeedCondition();
        this.updateLinearDeviation();

        if (this.verticalState === DescentVerticalGuidanceState.ProvidingGuidance) {
            this.updateDesModeGuidance();
        }

        this.writeToSimVars();
        this.todGuidance.update(deltaTime);
    }

    private updateLinearDeviation() {
        const { fcuVerticalMode, flightPhase } = this.observer.get();

        this.targetAltitude = this.aircraftToDescentProfileRelation.currentTargetAltitude();

        this.showLinearDeviationOnPfd = flightPhase < FmgcFlightPhase.GoAround && (flightPhase >= FmgcFlightPhase.Descent || this.aircraftToDescentProfileRelation.isPastTopOfDescent())
            && fcuVerticalMode !== VerticalMode.GS_CPT
            && fcuVerticalMode !== VerticalMode.GS_TRACK
            && fcuVerticalMode !== VerticalMode.LAND
            && fcuVerticalMode !== VerticalMode.FLARE
            && fcuVerticalMode !== VerticalMode.ROLL_OUT;
    }

    private updateDesModeGuidance() {
        const isOnGeometricPath = this.aircraftToDescentProfileRelation.isOnGeometricPath();
        const isAboveSpeedLimitAltitude = this.aircraftToDescentProfileRelation.isAboveSpeedLimitAltitude();
        const isCloseToAirfieldElevation = this.aircraftToDescentProfileRelation.isCloseToAirfieldElevation();
        const isBeforeTopOfDescent = !this.aircraftToDescentProfileRelation.isPastTopOfDescent();
        const linearDeviation = this.aircraftToDescentProfileRelation.computeLinearDeviation();
        const isSpeedAuto = Simplane.getAutoPilotAirspeedManaged();
        const isApproachPhaseActive = this.observer.get().flightPhase === FmgcFlightPhase.Approach;
        const isHoldActive = this.guidanceController.isManualHoldActive();

        this.targetAltitudeGuidance = this.atmosphericConditions.estimatePressureAltitudeInMsfs(
            this.aircraftToDescentProfileRelation.currentTargetAltitude(),
        );

        if ((!isHoldActive && linearDeviation > 200) || this.isInOverspeedCondition) {
            // above path
            this.requestedVerticalMode = RequestedVerticalMode.SpeedThrust;
        } else if (isBeforeTopOfDescent || linearDeviation < -100 || isHoldActive) {
            // below path
            if (isHoldActive) {
                this.requestedVerticalMode = RequestedVerticalMode.VsSpeed;
                this.targetVerticalSpeed = -1000;
            } else if (isOnGeometricPath) {
                this.requestedVerticalMode = RequestedVerticalMode.FpaSpeed;
                this.targetVerticalSpeed = this.aircraftToDescentProfileRelation.currentTargetPathAngle() / 2;
            } else {
                this.requestedVerticalMode = RequestedVerticalMode.VsSpeed;
                this.targetVerticalSpeed = (isAboveSpeedLimitAltitude && !isCloseToAirfieldElevation ? -1000 : -500);
            }
        } else if (!isOnGeometricPath && isSpeedAuto && !this.isInUnderspeedCondition && !isApproachPhaseActive) {
            // on idle path

            this.requestedVerticalMode = RequestedVerticalMode.VpathThrust;
            this.targetVerticalSpeed = this.aircraftToDescentProfileRelation.currentTargetVerticalSpeed();
        } else {
            // on geometric path

            this.requestedVerticalMode = RequestedVerticalMode.VpathSpeed;
            this.targetVerticalSpeed = this.aircraftToDescentProfileRelation.currentTargetVerticalSpeed();
        }
    }

    private updateSpeedTarget() {
        const { fcuSpeed, managedDescentSpeedMach, flightPhase } = this.observer.get();
        const inManagedSpeed = Simplane.getAutoPilotAirspeedManaged();

        // In the approach phase we want to fetch the correct speed target from the JS code.
        // This is because the guidance logic is a bit different in this case.
        const managedSpeedTarget = flightPhase === FmgcFlightPhase.Approach
            ? SimVar.GetSimVarValue('L:A32NX_SPEEDS_MANAGED_ATHR', 'knots')
            : Math.round(this.iasOrMach(SimVar.GetSimVarValue('L:A32NX_SPEEDS_MANAGED_PFD', 'knots'), managedDescentSpeedMach));

        this.speedTarget = inManagedSpeed ? managedSpeedTarget : fcuSpeed;
    }

    private writeToSimVars() {
        SimVar.SetSimVarValue('L:A32NX_FG_REQUESTED_VERTICAL_MODE', 'Enum', this.requestedVerticalMode);
        SimVar.SetSimVarValue('L:A32NX_FG_TARGET_ALTITUDE', 'Feet', this.targetAltitudeGuidance);
        SimVar.SetSimVarValue('L:A32NX_FG_TARGET_VERTICAL_SPEED', 'number', this.targetVerticalSpeed);

        SimVar.SetSimVarValue('L:A32NX_PFD_TARGET_ALTITUDE', 'Feet', this.targetAltitude);
        SimVar.SetSimVarValue('L:A32NX_PFD_LINEAR_DEVIATION_ACTIVE', 'Bool', this.showLinearDeviationOnPfd);
        SimVar.SetSimVarValue('L:A32NX_PFD_VERTICAL_PROFILE_LATCHED', 'Bool', this.showDescentLatchOnPfd);
    }

    private updateSpeedGuidance() {
        if (this.speedState === DescentSpeedGuidanceState.NotInDescentPhase) {
            return;
        }

        const maxBias = 8;
        const speedBias = this.requestedVerticalMode === RequestedVerticalMode.SpeedThrust
            ? Math.max(Math.min(this.aircraftToDescentProfileRelation.computeLinearDeviation() / 100, maxBias), 0)
            : 0;

        const airspeed = this.atmosphericConditions.currentAirspeed;
        const guidanceTarget = this.useDynamicSpeedTarget()
            ? this.speedMargin.getTarget(airspeed + speedBias, this.speedTarget)
            : this.speedTarget;
        SimVar.SetSimVarValue('L:A32NX_SPEEDS_MANAGED_ATHR', 'knots', guidanceTarget);

        if (this.speedState === DescentSpeedGuidanceState.TargetAndMargins) {
            const [lower, upper] = this.speedMargin.getMargins(this.speedTarget);

            SimVar.SetSimVarValue('L:A32NX_PFD_LOWER_SPEED_MARGIN', 'Knots', lower);
            SimVar.SetSimVarValue('L:A32NX_PFD_UPPER_SPEED_MARGIN', 'Knots', upper);
        }
    }

    private useDynamicSpeedTarget(): boolean {
        return this.speedState === DescentSpeedGuidanceState.TargetAndMargins
            && (this.requestedVerticalMode === RequestedVerticalMode.SpeedThrust || this.requestedVerticalMode === RequestedVerticalMode.VpathThrust);
    }

    private updateSpeedMarginState() {
        const { flightPhase } = this.observer.get();
        const isHoldActive = this.guidanceController.isManualHoldActive();

        if (flightPhase !== FmgcFlightPhase.Descent) {
            this.changeSpeedState(DescentSpeedGuidanceState.NotInDescentPhase);
            return;
        }

        const shouldShowMargins = !isHoldActive
            && this.verticalState === DescentVerticalGuidanceState.ProvidingGuidance
            && Simplane.getAutoPilotAirspeedManaged();
        this.changeSpeedState(shouldShowMargins ? DescentSpeedGuidanceState.TargetAndMargins : DescentSpeedGuidanceState.TargetOnly);
    }

    private changeSpeedState(newState: DescentSpeedGuidanceState) {
        if (this.speedState === newState) {
            return;
        }

        // Hide margins if they were previously visible, but the state changed to literally anything else
        if (this.speedState === DescentSpeedGuidanceState.TargetAndMargins) {
            SimVar.SetSimVarValue('L:A32NX_PFD_SHOW_SPEED_MARGINS', 'boolean', false);
            SimVar.SetSimVarValue('L:A32NX_PFD_LOWER_SPEED_MARGIN', 'Knots', 0);
            SimVar.SetSimVarValue('L:A32NX_PFD_UPPER_SPEED_MARGIN', 'Knots', 0);
        } else if (newState === DescentSpeedGuidanceState.TargetAndMargins) {
            SimVar.SetSimVarValue('L:A32NX_PFD_SHOW_SPEED_MARGINS', 'boolean', true);
        }

        this.speedState = newState;
    }

    private iasOrMach(ias: Knots, mach: Mach) {
        const machAsIas = SimVar.GetGameVarValue('FROM MACH TO KIAS', 'number', mach);

        if (ias > machAsIas) {
            return machAsIas;
        }

        return ias;
    }

    private updateOverUnderspeedCondition() {
        const airspeed = this.atmosphericConditions.currentAirspeed;

        let upperLimit = this.speedTarget;
        let lowerLimit = this.speedTarget;
        if (this.speedState === DescentSpeedGuidanceState.TargetAndMargins) {
            const [lower, upper] = this.speedMargin.getMargins(this.speedTarget);

            lowerLimit = lower;
            upperLimit = upper;
        }

        if (this.isInOverspeedCondition && airspeed < upperLimit) {
            this.isInOverspeedCondition = false;
        } else if (!this.isInOverspeedCondition && airspeed > upperLimit + 5) {
            this.isInOverspeedCondition = true;
        }

        if (this.isInUnderspeedCondition && airspeed > lowerLimit) {
            this.isInUnderspeedCondition = false;
        } else if (!this.isInUnderspeedCondition && airspeed < lowerLimit - 5) {
            this.isInUnderspeedCondition = true;
        }
    }
}
