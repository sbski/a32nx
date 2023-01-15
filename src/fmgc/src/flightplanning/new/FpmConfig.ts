// Copyright (c) 2021-2022 FlyByWire Simulations
// Copyright (c) 2021-2022 Synaptic Simulations
//
// SPDX-License-Identifier: GPL-3.0

export interface FpmConfig {
    /**
     * Whether deleting a waypoint or a discontinuity creates a temporary flight plan
     */
    TMPY_ON_DELETE_WAYPOINT: boolean,

    /**
     * Whether toggling an overfly creates a temporary flight plan
     */
    TMPY_ON_OVERFLY: boolean,

    /**
     * Whether further changes can be made to the temporary flight plan after it is created from a revision
     */
    ALLOW_REVISIONS_ON_TMPY: boolean,

    /**
     * Maximum number of flight plan legs
     */
    MAX_NUM_LEGS: number,

    /**
     * Whether to advertise only VIAs that are compatible with the selected STAR (first waypoint of VIA is in STAR)
     */
    CHECK_VIA_COMPATIBILITY: boolean,

    /**
     * Whether the next abeam point of a DIR TO WITH ABEAM is considered as the TO waypoint emitted by the FPm
     */
    DIR_TO_ABEAM_POINT_IS_TO_WPT: boolean,
}

export class FpmConfigs {
    static A380: FpmConfig = {
        TMPY_ON_DELETE_WAYPOINT: true,
        TMPY_ON_OVERFLY: true,
        ALLOW_REVISIONS_ON_TMPY: true,
        MAX_NUM_LEGS: 200,
        CHECK_VIA_COMPATIBILITY: true,
        DIR_TO_ABEAM_POINT_IS_TO_WPT: true,
    };

    static A320_HONEYWELL_H3: FpmConfig = {
        TMPY_ON_DELETE_WAYPOINT: false,
        TMPY_ON_OVERFLY: false,
        ALLOW_REVISIONS_ON_TMPY: false,
        MAX_NUM_LEGS: 250,
        CHECK_VIA_COMPATIBILITY: false,
        DIR_TO_ABEAM_POINT_IS_TO_WPT: false,
    };
}
