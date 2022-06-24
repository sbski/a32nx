// Copyright (c) 2021-2022 FlyByWire Simulations
// Copyright (c) 2021-2022 Synaptic Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { Subject } from 'msfssdk';

type VSpeedValue = 0 | undefined;

export class FlightPlanPerformanceData {
    /**
     * V1 speed
     */
    readonly v1 = Subject.create<VSpeedValue>(undefined);

    /**
     * VR speed
     */
    readonly vr = Subject.create<VSpeedValue>(undefined);

    /**
     * V2 speed
     */
    readonly v2 = Subject.create<VSpeedValue>(undefined);
}
