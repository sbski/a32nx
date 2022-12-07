import { AltitudeConstraint, AltitudeConstraintType } from '@fmgc/guidance/lnav/legs';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { VerticalSpeedStrategy } from '@fmgc/guidance/vnav/climb/ClimbStrategy';
import { SpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { DescentStrategy } from '@fmgc/guidance/vnav/descent/DescentStrategy';
import { StepResults } from '@fmgc/guidance/vnav/Predictions';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { MaxSpeedConstraint, VerticalCheckpoint, VerticalCheckpointForDeceleration, VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { TemporaryCheckpointSequence } from '@fmgc/guidance/vnav/profile/TemporaryCheckpointSequence';
import { SpeedLimit } from '@fmgc/guidance/vnav/SpeedLimit';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { WindComponent } from '@fmgc/guidance/vnav/wind';
import { HeadwindProfile } from '@fmgc/guidance/vnav/wind/HeadwindProfile';

type MinimumDescentAltitudeConstraint = {
    distanceFromStart: NauticalMiles,
    minimumAltitude: Feet,
}

export class TacticalDescentPathBuilder {
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
    buildTacticalDescentPath(
        profile: BaseGeometryProfile,
        descentStrategy: DescentStrategy,
        speedProfile: SpeedProfile,
        windProfile: HeadwindProfile,
        finalAltitude: Feet,
        forcedDecelerations: VerticalCheckpointForDeceleration[],
    ) {
        const start = profile.lastCheckpoint;

        let minAlt = Infinity;
        const altConstraintsToUse = profile.descentAltitudeConstraints.map((constraint) => {
            minAlt = Math.min(minAlt, minimumAltitude(constraint.constraint));
            return {
                distanceFromStart: constraint.distanceFromStart,
                minimumAltitude: minAlt,
            } as MinimumDescentAltitudeConstraint;
        });

        const phaseTable = new PhaseTable(windProfile);
        phaseTable.start = start;
        phaseTable.phases = [
            new DescendToAltitude(finalAltitude),
        ];

        let isPathValid = false;
        let numRecomputations = 0;
        while (!isPathValid && numRecomputations++ < 100) {
            phaseTable.execute(descentStrategy, this.levelFlightStrategy);
            isPathValid = this.checkForViolations(phaseTable, profile, altConstraintsToUse, speedProfile, forcedDecelerations);
        }

        profile.checkpoints.push(...phaseTable.phases.map((phase) => phase.lastResult).filter((checkpoint) => checkpoint !== null));
    }

    /**
     * Check the path for violations and handle them. Return true if the path is valid, false otherwise.
     * @param phaseTable
     * @param profile
     * @param altitudeConstraints
     * @param speedProfile
     * @param forcedDecelerations
     * @returns
     */
    private checkForViolations(
        phaseTable: PhaseTable,
        profile: BaseGeometryProfile,
        altitudeConstraints: MinimumDescentAltitudeConstraint[],
        speedProfile: SpeedProfile,
        forcedDecelerations: VerticalCheckpointForDeceleration[],
    ): boolean {
        const { descentSpeedLimit } = this.observer.get();

        let previousResult = phaseTable.start;
        for (let i = 0; i < phaseTable.phases.length; i++) {
            const phase = phaseTable.phases[i];
            if (!phase.lastResult) {
                continue;
            }

            for (const forcedDeceleration of forcedDecelerations) {
                if (this.doesPhaseViolateForcedConstraintDeceleration(phase, forcedDeceleration)) {
                    if (forcedDeceleration.reason === VerticalCheckpointReason.StartDecelerationToConstraint) {
                        this.handleForcedConstraintDecelerationViolation(phaseTable, i, forcedDeceleration);
                    } else if (forcedDeceleration.reason === VerticalCheckpointReason.StartDecelerationToLimit) {
                        this.handleForcedSpeedLimitDecelerationViolation(phaseTable, i, forcedDeceleration);
                    }

                    return false;
                }
            }

            for (const speedConstraint of profile.descentSpeedConstraints) {
                if (this.doesPhaseViolateSpeedConstraint(phase, speedConstraint)) {
                    this.handleSpeedConstraintViolation(phaseTable, i, speedConstraint);

                    return false;
                }
            }

            for (const altitudeConstraint of altitudeConstraints) {
                if (this.doesPhaseViolateAltitudeConstraint(previousResult, phase, altitudeConstraint)) {
                    this.handleAltitudeConstraintViolation(phaseTable, i, altitudeConstraint);

                    return false;
                }
            }

            if (speedProfile.shouldTakeDescentSpeedLimitIntoAccount()) {
                if (this.doesPhaseViolateSpeedLimit(phase, descentSpeedLimit)) {
                    this.handleSpeedLimitViolation(phaseTable, i, descentSpeedLimit);

                    return false;
                }
            }

            previousResult = phase.lastResult;
        }

        return true;
    }

    private handleForcedConstraintDecelerationViolation(phaseTable: PhaseTable, violatingPhaseIndex: number, forcedDeceleration: VerticalCheckpointForDeceleration) {
        const violatingPhase = phaseTable.phases[violatingPhaseIndex];

        if (violatingPhase instanceof DescendingDeceleration) {
            // If we are already decelerating, make sure we decelerate to the correct speed
            if (violatingPhase.toSpeed > forcedDeceleration.targetSpeed) {
                violatingPhase.toSpeed = forcedDeceleration.targetSpeed;
            }

            const overshoot = violatingPhase.lastResult.distanceFromStart - forcedDeceleration.distanceFromStart;

            for (let i = violatingPhaseIndex - 1; i >= 0; i--) {
                const previousPhase = phaseTable.phases[i];

                if (previousPhase instanceof DescendToAltitude) {
                    phaseTable.phases.splice(i - 1, 1, new DescendToDistance(previousPhase.lastResult.distanceFromStart - overshoot));
                } else if (previousPhase instanceof DescendToDistance) {
                    previousPhase.toDistance -= overshoot;
                }

                return;
            }
        } else {
            phaseTable.phases.splice(violatingPhaseIndex, 0,
                new DescendToDistance(forcedDeceleration.distanceFromStart),
                new DescendingDeceleration(forcedDeceleration.targetSpeed).withReasonBefore(VerticalCheckpointReason.StartDecelerationToConstraint));
        }
    }

    private handleForcedSpeedLimitDecelerationViolation(phaseTable: PhaseTable, violatingPhaseIndex: number, forcedDeceleration: VerticalCheckpointForDeceleration) {
        const violatingPhase = phaseTable.phases[violatingPhaseIndex];

        if (violatingPhase instanceof DescendingDeceleration) {
            // If we are already decelerating, make sure we decelerate to the correct speed
            if (violatingPhase.toSpeed > forcedDeceleration.targetSpeed) {
                violatingPhase.toSpeed = forcedDeceleration.targetSpeed;
            }

            const overshoot = violatingPhase.lastResult.altitude - forcedDeceleration.altitude;

            for (let i = violatingPhaseIndex - 1; i >= 0; i--) {
                const previousPhase = phaseTable.phases[i];

                if (previousPhase instanceof DescendToAltitude) {
                    previousPhase.toAltitude -= overshoot;
                } else if (previousPhase instanceof DescendToDistance) {
                    phaseTable.phases.splice(i - 1, 1, new DescendToAltitude(previousPhase.lastResult.altitude - overshoot));
                }

                return;
            }
        } else {
            phaseTable.phases.splice(violatingPhaseIndex, 0,
                new DescendToAltitude(forcedDeceleration.altitude),
                new DescendingDeceleration(forcedDeceleration.targetSpeed).withReasonBefore(VerticalCheckpointReason.StartDecelerationToLimit));
        }
    }

    private handleSpeedConstraintViolation(phaseTable: PhaseTable, violatingPhaseIndex: number, speedConstraint: MaxSpeedConstraint) {
        const violatingPhase = phaseTable.phases[violatingPhaseIndex];

        if (violatingPhase instanceof DescendingDeceleration) {
            if (violatingPhase.toSpeed > speedConstraint.maxSpeed) {
                violatingPhase.toSpeed = speedConstraint.maxSpeed;
            }
        } else {
            phaseTable.phases.splice(violatingPhaseIndex, 0, new DescendingDeceleration(speedConstraint.maxSpeed));
        }

        const overshoot = violatingPhase.lastResult.distanceFromStart - speedConstraint.distanceFromStart;

        for (let i = violatingPhaseIndex - 1; i >= 0; i--) {
            const previousPhase = phaseTable.phases[i];

            if (previousPhase instanceof DescendToAltitude) {
                phaseTable.phases.splice(violatingPhaseIndex, 1, new DescendToDistance(previousPhase.lastResult.distanceFromStart - overshoot));
            } else if (previousPhase instanceof DescendToDistance) {
                previousPhase.toDistance -= overshoot;
            }

            return;
        }
    }

    private handleAltitudeConstraintViolation(phaseTable: PhaseTable, violatingPhaseIndex: number, altitudeConstraint: MinimumDescentAltitudeConstraint) {
        const violatingPhase = phaseTable.phases[violatingPhaseIndex];

        if (violatingPhase instanceof DescendingDeceleration) {
            phaseTable.phases.splice(violatingPhaseIndex, 0,
                new DescendingDeceleration(violatingPhase.toSpeed).withMinAltitude(altitudeConstraint.minimumAltitude),
                new DescendingDeceleration(violatingPhase.toSpeed).asLevelSegment().withMaxDistance(altitudeConstraint.distanceFromStart));
        } else if (violatingPhase instanceof DescendToAltitude) {
            phaseTable.phases.splice(violatingPhaseIndex, 0,
                new DescendToAltitude(altitudeConstraint.minimumAltitude).withReasonAfter(VerticalCheckpointReason.LevelOffForDescentConstraint),
                new DescendToDistance(altitudeConstraint.distanceFromStart).asLevelSegment());
        } else if (violatingPhase instanceof DescendToDistance) {
            phaseTable.phases.splice(violatingPhaseIndex, 0,
                new DescendToAltitude(altitudeConstraint.minimumAltitude).withReasonAfter(VerticalCheckpointReason.LevelOffForDescentConstraint),
                new DescendToDistance(altitudeConstraint.distanceFromStart).asLevelSegment());
        }
    }

    private handleSpeedLimitViolation(phaseTable: PhaseTable, violatingPhaseIndex: number, speedLimit: SpeedLimit) {
        const violatingPhase = phaseTable.phases[violatingPhaseIndex];

        if (violatingPhase instanceof DescendingDeceleration) {
            if (violatingPhase.toSpeed > speedLimit.speed) {
                violatingPhase.toSpeed = speedLimit.speed;
            }

            const overshoot = violatingPhase.lastResult.altitude - speedLimit.underAltitude; // This is typically negative

            for (let i = violatingPhaseIndex - 1; i >= 0; i--) {
                const previousPhase = phaseTable.phases[i];

                if (previousPhase instanceof DescendToAltitude) {
                    previousPhase.toAltitude -= overshoot;
                } else if (previousPhase instanceof DescendToDistance) {
                    phaseTable.phases.splice(violatingPhaseIndex, 1, new DescendToAltitude(previousPhase.lastResult.altitude - overshoot));
                }

                return;
            }
        }

        phaseTable.phases.splice(violatingPhaseIndex, 0, new DescendingDeceleration(speedLimit.speed));
    }

    private doesPhaseViolateForcedConstraintDeceleration(phase: SubPhase, forcedDeceleration: VerticalCheckpointForDeceleration) {
        if (forcedDeceleration.reason === VerticalCheckpointReason.StartDecelerationToConstraint) {
            if (phase.lastResult.distanceFromStart <= forcedDeceleration.distanceFromStart) {
                return false;
            }
        } else if (forcedDeceleration.reason === VerticalCheckpointReason.StartDecelerationToLimit) {
            if (phase.lastResult.altitude >= forcedDeceleration.altitude) {
                return false;
            }
        }

        if (phase instanceof DescendingDeceleration) {
            return phase.toSpeed > forcedDeceleration.targetSpeed;
        }

        return phase.lastResult.speed > forcedDeceleration.targetSpeed;
    }

    private doesPhaseViolateSpeedConstraint(phase: SubPhase, speedConstraint: MaxSpeedConstraint) {
        if (phase.lastResult.distanceFromStart < speedConstraint.distanceFromStart) {
            return false;
        }

        if (phase instanceof DescendingDeceleration) {
            return phase.toSpeed > speedConstraint.maxSpeed;
        }

        return phase.lastResult.speed > speedConstraint.maxSpeed;
    }

    private doesPhaseViolateAltitudeConstraint(previousResult: VerticalCheckpoint, phase: SubPhase, altitudeConstraint: MinimumDescentAltitudeConstraint) {
        if (phase.lastResult.altitude >= altitudeConstraint.minimumAltitude || previousResult.distanceFromStart > altitudeConstraint.distanceFromStart) {
            return false;
        }

        const gradient = (previousResult.altitude - phase.lastResult.altitude) / (previousResult.distanceFromStart - phase.lastResult.distanceFromStart);
        const altAtConstraint = previousResult.altitude + gradient * (altitudeConstraint.distanceFromStart - previousResult.distanceFromStart);

        return altAtConstraint < altitudeConstraint.minimumAltitude;
    }

    private doesPhaseViolateSpeedLimit(phase: SubPhase, speedLimit: SpeedLimit) {
        return phase.lastResult.altitude < speedLimit.underAltitude && phase.lastResult.speed > speedLimit.speed;
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

class PhaseTable {
    start: VerticalCheckpoint;

    phases: SubPhase[] = [];

    constructor(private readonly winds: HeadwindProfile) { }

    execute(descentStrategy: DescentStrategy, levelFlightStrategy: DescentStrategy) {
        const sequence = new TemporaryCheckpointSequence(this.start);

        for (const phase of this.phases) {
            if (phase.shouldExecute(sequence.lastCheckpoint)) {
                const headwind = this.winds.getHeadwindComponent(sequence.lastCheckpoint.distanceFromStart, sequence.lastCheckpoint.altitude);
                const phaseResult = phase.execute(phase.shouldFlyAsLevelSegment ? levelFlightStrategy : descentStrategy)(sequence.lastCheckpoint, headwind);

                if (phase.reasonBefore !== VerticalCheckpointReason.AtmosphericConditions) {
                    if (sequence.lastCheckpoint.reason === VerticalCheckpointReason.AtmosphericConditions) {
                        sequence.lastCheckpoint.reason = phase.reasonBefore;
                    } else {
                        sequence.copyLastCheckpoint({ reason: phase.reasonBefore });
                    }
                }

                if (phase instanceof DescendingDeceleration) {
                    (sequence.lastCheckpoint as VerticalCheckpointForDeceleration).targetSpeed = phase.toSpeed;
                }

                sequence.addCheckpointFromStep(phaseResult, phase.reasonAfter);

                phase.lastResult = sequence.lastCheckpoint;
            } else {
                phase.lastResult = null;
            }
        }
    }
}

abstract class SubPhase {
    lastResult?: VerticalCheckpoint = null;

    protected isLevelSegment = false;

    reasonAfter: VerticalCheckpointReason = VerticalCheckpointReason.AtmosphericConditions;

    reasonBefore: VerticalCheckpointReason = VerticalCheckpointReason.AtmosphericConditions;

    get shouldFlyAsLevelSegment(): boolean {
        return this.isLevelSegment;
    }

    abstract shouldExecute(start: VerticalCheckpoint): boolean;

    abstract execute(strategy: DescentStrategy): (start: VerticalCheckpoint, headwind: WindComponent) => StepResults;

    protected scaleStepBasedOnLastCheckpoint(lastCheckpoint: VerticalCheckpoint, step: StepResults, scaling: number) {
        step.distanceTraveled *= scaling;
        step.fuelBurned *= scaling;
        step.timeElapsed *= scaling;
        step.finalAltitude = (1 - scaling) * lastCheckpoint.altitude + scaling * step.finalAltitude;
        step.speed = (1 - scaling) * lastCheckpoint.speed + scaling * step.speed;
    }

    withReasonBefore(reason: VerticalCheckpointReason) {
        this.reasonBefore = reason;

        return this;
    }

    withReasonAfter(reason: VerticalCheckpointReason) {
        this.reasonAfter = reason;

        return this;
    }
}

class DescendingDeceleration extends SubPhase {
    maxDistance: NauticalMiles = Infinity;

    minAltitude: Feet = -Infinity;

    constructor(public toSpeed: number) {
        super();
    }

    withMaxDistance(maxDistance: NauticalMiles) {
        this.maxDistance = maxDistance;

        return this;
    }

    withMinAltitude(minAltitude: Feet) {
        this.minAltitude = minAltitude;

        return this;
    }

    asLevelSegment(): DescendingDeceleration {
        this.isLevelSegment = true;

        return this;
    }

    override shouldExecute(start: VerticalCheckpoint) {
        return start.speed > this.toSpeed && start.distanceFromStart < this.maxDistance && (this.shouldFlyAsLevelSegment || start.altitude > this.minAltitude);
    }

    override execute(strategy: DescentStrategy) {
        return (start: VerticalCheckpoint, headwind: WindComponent) => {
            const step = strategy.predictToSpeed(start.altitude, this.toSpeed, start.speed, start.mach, start.remainingFuelOnBoard, headwind);

            if (step.finalAltitude < this.minAltitude || start.distanceFromStart + step.distanceTraveled > this.maxDistance) {
                const scaling = Math.max(0, Math.min(
                    (this.maxDistance - start.distanceFromStart) / step.distanceTraveled,
                    (this.minAltitude - start.altitude) / (step.finalAltitude - start.altitude),
                    1,
                ));
                this.scaleStepBasedOnLastCheckpoint(start, step, scaling);
            }

            return step;
        };
    }
}
class DescendToAltitude extends SubPhase {
    constructor(public toAltitude: number) {
        super();
    }

    override shouldExecute(start: VerticalCheckpoint) {
        return start.altitude > this.toAltitude;
    }

    override execute(strategy: DescentStrategy) {
        return (start: VerticalCheckpoint, headwind: WindComponent) => strategy.predictToAltitude(
            start.altitude, this.toAltitude, start.speed, start.mach, start.remainingFuelOnBoard, headwind,
        );
    }
}
class DescendToDistance extends SubPhase {
    minAltitude: Feet = -Infinity;

    constructor(public toDistance: number) {
        super();
    }

    asLevelSegment(): DescendToDistance {
        this.isLevelSegment = true;

        return this;
    }

    override shouldExecute(start: VerticalCheckpoint) {
        return start.distanceFromStart < this.toDistance;
    }

    override execute(strategy: DescentStrategy) {
        return (start: VerticalCheckpoint, headwind: WindComponent) => {
            const step = strategy.predictToDistance(
                start.altitude, this.toDistance - start.distanceFromStart, start.speed, start.mach, start.remainingFuelOnBoard, headwind,
            );

            if (step.finalAltitude < this.minAltitude) {
                const scaling = (this.minAltitude - start.altitude) / (step.finalAltitude - start.altitude);
                this.scaleStepBasedOnLastCheckpoint(start, step, scaling);
            }

            return step;
        };
    }
}
