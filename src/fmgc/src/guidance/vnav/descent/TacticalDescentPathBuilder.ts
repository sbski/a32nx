import { BisectionMethod, NonTerminationStrategy } from '@fmgc/guidance/vnav/BisectionMethod';
import { SpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { DescentStrategy } from '@fmgc/guidance/vnav/descent/DescentStrategy';
import { StepResults } from '@fmgc/guidance/vnav/Predictions';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { MaxSpeedConstraint, VerticalCheckpoint, VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { TemporaryCheckpointSequence } from '@fmgc/guidance/vnav/profile/TemporaryCheckpointSequence';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { HeadwindProfile } from '@fmgc/guidance/vnav/wind/HeadwindProfile';

type DecelerationToSpeedConstraint = {
    decelerationDistanceFromStart: NauticalMiles,
    speed: Knots,
}

type DecelerationToSpeedLimit = {
    distanceFromStart: NauticalMiles,
    altitude: Feet,
    speed: Knots,
}

export class TacticalDescentPathBuilder {
    nextDecelerationToSpeedConstraint?: DecelerationToSpeedConstraint = null;

    nextDecelerationToSpeedLimit?: DecelerationToSpeedLimit = null;

    constructor(private observer: VerticalProfileComputationParametersObserver) { }

    /**
     * Builds a path from the last checkpoint to the finalAltitude
     * @param profile
     * @param descentStrategy
     * @param speedProfile
     * @param windProfile
     * @param finalAltitude
     */
    buildTacticalDescentPath(profile: BaseGeometryProfile, descentStrategy: DescentStrategy, speedProfile: SpeedProfile, windProfile: HeadwindProfile, finalAltitude: Feet) {
        this.nextDecelerationToSpeedConstraint = null;
        this.nextDecelerationToSpeedLimit = null;

        const { descentSpeedLimit, managedDescentSpeedMach } = this.observer.get();
        const initialAltitude = profile.lastCheckpoint.altitude;
        const constraintsToUse = profile.descentSpeedConstraints
            .slice()
            .reverse()
            .sort((a, b) => a.distanceFromStart - b.distanceFromStart);

        if (speedProfile.shouldTakeDescentSpeedLimitIntoAccount() && finalAltitude < descentSpeedLimit.underAltitude && profile.lastCheckpoint.speed > descentSpeedLimit.speed) {
            let descentSegment = new TemporaryCheckpointSequence(profile.lastCheckpoint);
            let decelerationSegment: StepResults = null;

            const tryDecelAltitude = (speedLimitDecelAltitude: Feet): Feet => {
                descentSegment = this.buildToAltitude(profile.lastCheckpoint, descentStrategy, constraintsToUse, windProfile, speedLimitDecelAltitude);

                // If we've already decelerated below the constraint speed due to a previous constraint, we don't need to decelerate anymore.
                // We return 0 because the bisection method will terminate if the error is zero.
                if (descentSegment.lastCheckpoint.speed <= descentSpeedLimit.speed) {
                    return 0;
                }

                decelerationSegment = descentStrategy.predictToSpeed(
                    descentSegment.lastCheckpoint.altitude,
                    Math.min(descentSegment.lastCheckpoint.speed, descentSpeedLimit.speed),
                    descentSegment.lastCheckpoint.speed,
                    managedDescentSpeedMach,
                    descentSegment.lastCheckpoint.remainingFuelOnBoard,
                    windProfile.getHeadwindComponent(descentSegment.lastCheckpoint.distanceFromStart, descentSegment.lastCheckpoint.altitude),
                );

                const altitudeOvershoot = descentSpeedLimit.underAltitude - decelerationSegment.finalAltitude;
                return altitudeOvershoot;
            };

            const foundAltitude = BisectionMethod.findZero(
                tryDecelAltitude,
                [descentSpeedLimit.underAltitude, Math.min(descentSpeedLimit.underAltitude + 6000, profile.lastCheckpoint.altitude)],
                [-500, 0],
                NonTerminationStrategy.NegativeErrorResult,
            );
            tryDecelAltitude(foundAltitude);

            profile.checkpoints.push(...descentSegment.get());

            // If we returned early, it's possible that it was not necessary to compute a `decelerationSegment`, so this would be null
            if (decelerationSegment) {
                this.nextDecelerationToSpeedLimit = {
                    distanceFromStart: descentSegment.lastCheckpoint.distanceFromStart,
                    altitude: foundAltitude,
                    speed: descentSpeedLimit.speed,
                };

                if (descentSegment.length > 1) {
                    profile.lastCheckpoint.reason = VerticalCheckpointReason.StartDeceleration;
                }

                descentSegment.addCheckpointFromStep(decelerationSegment, VerticalCheckpointReason.AtmosphericConditions);
            }
        }

        const sequenceToFinalAltitude = this.buildToAltitude(profile.lastCheckpoint, descentStrategy, constraintsToUse, windProfile, finalAltitude);

        profile.checkpoints.push(...sequenceToFinalAltitude.get());

        // Level off arrow is only shown if more than 100 ft away
        if (profile.lastCheckpoint.altitude - initialAltitude < -100) {
            profile.lastCheckpoint.reason = VerticalCheckpointReason.CrossingFcuAltitudeDescent;
        }
    }

    private buildToAltitude(
        start: VerticalCheckpoint, descentStrategy: DescentStrategy, constraints: MaxSpeedConstraint[], windProfile: HeadwindProfile, finalAltitude: Feet,
    ): TemporaryCheckpointSequence {
        const sequence = new TemporaryCheckpointSequence(start);
        const { managedDescentSpeedMach } = this.observer.get();

        for (const constraint of constraints) {
            this.handleSpeedConstraint(sequence, constraint, descentStrategy, windProfile);

            // If we overshoot the final altitude, remove waypoints
            if (sequence.lastCheckpoint.altitude - finalAltitude < 1) {
                while (sequence.checkpoints.length > 1 && sequence.lastCheckpoint.altitude <= finalAltitude) {
                    sequence.checkpoints.splice(-1, 1);
                }

                break;
            }
        }

        // We only build the segment to the final altitude if we're more than a floating point error away.
        // Otherwise, in VS 0 strategy, we might never reach it
        if (sequence.lastCheckpoint.altitude - finalAltitude > 1) {
            const descentSegment = descentStrategy.predictToAltitude(
                sequence.lastCheckpoint.altitude,
                finalAltitude,
                sequence.lastCheckpoint.speed,
                managedDescentSpeedMach,
                sequence.lastCheckpoint.remainingFuelOnBoard,
                windProfile.getHeadwindComponent(sequence.lastCheckpoint.distanceFromStart, sequence.lastCheckpoint.altitude),
            );

            sequence.addCheckpointFromStep(descentSegment, VerticalCheckpointReason.AtmosphericConditions);
        }

        return sequence;
    }

    private handleSpeedConstraint(sequence: TemporaryCheckpointSequence, constraint: MaxSpeedConstraint, descentStrategy: DescentStrategy, windProfile: HeadwindProfile) {
        if (sequence.lastCheckpoint.distanceFromStart > constraint.distanceFromStart) {
            return;
        }

        const { managedDescentSpeedMach } = this.observer.get();

        const distanceToConstraint = constraint.distanceFromStart - sequence.lastCheckpoint.distanceFromStart;

        let descentSegment: StepResults = null;
        let decelerationSegment: StepResults = null;

        const tryDecelDistance = (decelerationSegmentDistance: NauticalMiles): NauticalMiles => {
            descentSegment = descentStrategy.predictToDistance(
                sequence.lastCheckpoint.altitude,
                distanceToConstraint - decelerationSegmentDistance,
                sequence.lastCheckpoint.speed,
                managedDescentSpeedMach,
                sequence.lastCheckpoint.remainingFuelOnBoard,
                windProfile.getHeadwindComponent(sequence.lastCheckpoint.distanceFromStart, sequence.lastCheckpoint.altitude),
            );

            decelerationSegment = descentStrategy.predictToSpeed(
                descentSegment.finalAltitude,
                // We don't ignore speed constraints which are already satisfied, but for those that are,
                // we get a decel distance of 0. We still want to consider the constraint, so the speed guidance follows it.
                Math.min(constraint.maxSpeed, descentSegment.speed),
                descentSegment.speed,
                managedDescentSpeedMach,
                sequence.lastCheckpoint.remainingFuelOnBoard - descentSegment.fuelBurned,
                windProfile.getHeadwindComponent(sequence.lastCheckpoint.distanceFromStart + descentSegment.distanceTraveled, descentSegment.finalAltitude),
            );

            const totalDistanceTravelled = descentSegment.distanceTraveled + decelerationSegment.distanceTraveled;
            const distanceOvershoot = totalDistanceTravelled - distanceToConstraint;

            return distanceOvershoot;
        };

        const decelDistance = BisectionMethod.findZero(tryDecelDistance, [0, 20], [-0.05, 0.05]);

        const isMoreConstrainingThanPreviousConstraint = !this.nextDecelerationToSpeedConstraint
            || constraint.distanceFromStart - decelDistance < this.nextDecelerationToSpeedConstraint.decelerationDistanceFromStart;
        if (isMoreConstrainingThanPreviousConstraint) {
            this.nextDecelerationToSpeedConstraint = {
                decelerationDistanceFromStart: constraint.distanceFromStart - decelDistance,
                speed: constraint.maxSpeed,
            };
        }

        sequence.addCheckpointFromStep(descentSegment, VerticalCheckpointReason.StartDeceleration);
        sequence.addCheckpointFromStep(decelerationSegment, VerticalCheckpointReason.SpeedConstraint);
    }
}
