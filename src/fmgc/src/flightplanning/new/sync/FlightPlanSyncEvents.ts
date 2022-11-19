// Copyright (c) 2021-2022 FlyByWire Simulations
// Copyright (c) 2021-2022 Synaptic Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { Discontinuity, SerializedFlightPlanLeg } from '@fmgc/flightplanning/new/legs/FlightPlanLeg';
import { FlightPlanLegDefinition } from '@fmgc/flightplanning/new/legs/FlightPlanLegDefinition';

export interface FlightPlanSyncEvent {
    planIndex: number,
}

export interface FlightPlanManagerEvent extends FlightPlanSyncEvent {
    targetPlanIndex?: number,
}

export interface FlightPlanSetActiveLegIndexEvent extends FlightPlanSyncEvent {
    activeLegIndex: number,
}

export interface FlightPlanSetSegmentLegsEvent extends FlightPlanSyncEvent {
    segmentIndex: number,
    legs: (SerializedFlightPlanLeg | Discontinuity)[],
}

export interface FlightPlanLegDefinitionEditEvent extends FlightPlanSyncEvent {
    atIndex: number,
    newDefinition: FlightPlanLegDefinition,
}

export interface FlightPlanSyncEvents {
    'flightPlanManager.create': FlightPlanManagerEvent,
    'flightPlanManager.delete': FlightPlanManagerEvent,
    'flightPlanManager.deleteAll': undefined,
    'flightPlanManager.copy': FlightPlanManagerEvent,
    'flightPlanManager.swap': FlightPlanManagerEvent,

    'flightPlan.setActiveLegIndex': FlightPlanSetActiveLegIndexEvent,
    'flightPlan.setSegmentLegs': FlightPlanSetSegmentLegsEvent,
    'flightPlan.legDefinitionEdit': FlightPlanLegDefinitionEditEvent,
}
