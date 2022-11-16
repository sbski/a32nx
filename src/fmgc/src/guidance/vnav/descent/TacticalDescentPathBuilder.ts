import { AltitudeConstraint, AltitudeConstraintType } from '@fmgc/guidance/lnav/legs';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { BisectionMethod, NonTerminationStrategy } from '@fmgc/guidance/vnav/BisectionMethod';
import { VerticalSpeedStrategy } from '@fmgc/guidance/vnav/climb/ClimbStrategy';
import { SpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { DescentStrategy } from '@fmgc/guidance/vnav/descent/DescentStrategy';
import { StepResults } from '@fmgc/guidance/vnav/Predictions';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { MaxSpeedConstraint, VerticalCheckpoint, VerticalCheckpointForDeceleration, VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
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

type MinimumDescentAltitudeConstraint = {
    distanceFromStart: NauticalMiles,
    minimumAltitude: Feet,
}

export class TacticalDescentPathBuilder {
    nextDecelerationToSpeedConstraint?: DecelerationToSpeedConstraint = null;

    nextDecelerationToSpeedLimit?: DecelerationToSpeedLimit = null;

    private levelFlightStrategy: VerticalSpeedStrategy;

    constructor(private observer: VerticalProfileComputationParametersObserver, atmosphericConditions: AtmosphericConditions) {
        this.levelFlightStrategy = new VerticalSpeedStrategy(this.observer, atmosphericConditions, 0);
    }

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

        let minAlt = Infinity;
        const altConstraintsToUse = profile.descentAltitudeConstraints.map((constraint) => {
            minAlt = Math.min(minAlt, minimumAltitude(constraint.constraint));
            return {
                distanceFromStart: constraint.distanceFromStart,
                minimumAltitude: minAlt,
            } as MinimumDescentAltitudeConstraint;
        });

        // TODO:
        // Do descent speed constraints need to be sorted here?

        if (speedProfile.shouldTakeDescentSpeedLimitIntoAccount()
            && initialAltitude > descentSpeedLimit.underAltitude && finalAltitude <= descentSpeedLimit.underAltitude
            && profile.lastCheckpoint.speed > descentSpeedLimit.speed) {
            let descentSegment = new TemporaryCheckpointSequence(profile.lastCheckpoint);
            let decelerationSegment: StepResults = null;

            const tryDecelAltitude = (speedLimitDecelAltitude: Feet): Feet => {
                descentSegment = this.buildToAltitudeWithConstraints(
                    profile.lastCheckpoint, descentStrategy, altConstraintsToUse, profile.descentSpeedConstraints, windProfile, speedLimitDecelAltitude,
                );

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
                    (profile.lastCheckpoint as VerticalCheckpointForDeceleration).targetSpeed = descentSpeedLimit.speed;
                } else {
                    profile.addCheckpointFromLast(() => ({ reason: VerticalCheckpointReason.StartDeceleration, targetSpeed: descentSpeedLimit.speed }));
                }

                descentSegment.addCheckpointFromStep(decelerationSegment, VerticalCheckpointReason.AtmosphericConditions);
            }
        }

        const sequenceToFinalAltitude = this.buildToAltitudeWithConstraints(
            profile.lastCheckpoint, descentStrategy, altConstraintsToUse, profile.descentSpeedConstraints, windProfile, finalAltitude,
        );

        profile.checkpoints.push(...sequenceToFinalAltitude.get());

        // Level off arrow is only shown if more than 100 ft away
        if (profile.lastCheckpoint.altitude - initialAltitude < -100) {
            profile.lastCheckpoint.reason = VerticalCheckpointReason.CrossingFcuAltitudeDescent;
        }
    }

    private buildToAltitudeWithConstraints(
        start: VerticalCheckpoint,
        descentStrategy: DescentStrategy,
        altConstraints: MinimumDescentAltitudeConstraint[],
        speedConstraints: MaxSpeedConstraint[],
        windProfile: HeadwindProfile,
        finalAltitude: Feet,
    ): TemporaryCheckpointSequence {
        const { managedDescentSpeedMach } = this.observer.get();
        const sequence = new TemporaryCheckpointSequence(start);

        for (const altConstraint of altConstraints) {
            // If we're past the constraint, ignore it
            // If we're more than 100 feet below it, ignore it. 100 ft because we don't want it to be ignored when flying at constraint alt
            if (altConstraint.distanceFromStart < sequence.lastCheckpoint.distanceFromStart || altConstraint.minimumAltitude - sequence.lastCheckpoint.altitude > 100) {
                continue;
            } else if (altConstraint.minimumAltitude < finalAltitude) {
                break;
            }

            this.buildToAltitude(
                sequence,
                descentStrategy,
                speedConstraints,
                windProfile,
                // It's possible we're slightly below the constraint alt, so we don't want this to somehow build a climb segment
                Math.min(altConstraint.minimumAltitude, sequence.lastCheckpoint.altitude),
            );

            if (sequence.lastCheckpoint.distanceFromStart < altConstraint.distanceFromStart) {
                if (sequence.length > 1) {
                    sequence.lastCheckpoint.reason = VerticalCheckpointReason.LevelOffForDescentConstraint;
                }

                const levelSegment = this.levelFlightStrategy.predictToDistance(
                    sequence.lastCheckpoint.altitude,
                    altConstraint.distanceFromStart - sequence.lastCheckpoint.distanceFromStart,
                    sequence.lastCheckpoint.speed,
                    managedDescentSpeedMach,
                    sequence.lastCheckpoint.remainingFuelOnBoard,
                    windProfile.getHeadwindComponent(sequence.lastCheckpoint.distanceFromStart, sequence.lastCheckpoint.altitude),
                );

                sequence.addCheckpointFromStep(levelSegment, VerticalCheckpointReason.AltitudeConstraint);
            }
        }

        this.buildToAltitude(
            sequence,
            descentStrategy,
            speedConstraints,
            windProfile,
            finalAltitude,
        );

        return sequence;
    }

    private buildToAltitude(
        sequence: TemporaryCheckpointSequence, descentStrategy: DescentStrategy, constraints: MaxSpeedConstraint[], windProfile: HeadwindProfile, finalAltitude: Feet,
    ) {
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
        // We run the prediction again for the side effects.
        tryDecelDistance(decelDistance);

        const isMoreConstrainingThanPreviousConstraint = !this.nextDecelerationToSpeedConstraint
            || constraint.distanceFromStart - decelDistance < this.nextDecelerationToSpeedConstraint.decelerationDistanceFromStart;
        if (isMoreConstrainingThanPreviousConstraint) {
            this.nextDecelerationToSpeedConstraint = {
                decelerationDistanceFromStart: constraint.distanceFromStart - decelDistance,
                speed: constraint.maxSpeed,
            };
        }

        sequence.addDecelerationCheckpointFromStep(descentSegment, constraint.maxSpeed);
        sequence.addCheckpointFromStep(decelerationSegment, VerticalCheckpointReason.SpeedConstraint);
    }
}

function minimumAltitude(constraint: AltitudeConstraint): Feet {
    switch (constraint.type) {
    case AltitudeConstraintType.at:
    case AltitudeConstraintType.atOrAbove:
        return constraint.altitude1;
    case AltitudeConstraintType.atOrBelow:
        return -Infinity;
    case AltitudeConstraintType.range:
        return constraint.altitude2;
    default:
        console.error(`[FMS/VNAV] Unexpected constraint type: ${constraint.type}`);
        return -Infinity;
    }
}
