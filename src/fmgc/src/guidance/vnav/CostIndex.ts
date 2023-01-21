// Needed to calculate perfomance
import { Arinc429Word } from '@shared/arinc429';
// import { AirspaceType } from '@fmgc/types/fstypes/FSEnums';
import { MathUtils } from '@shared/MathUtils';
import { Common, FlapConf } from './common';
import { EngineModel } from './EngineModel';
import { FlightModel } from './FlightModel';

// Needed to get atomospheric conditions
import { } from './AtmosphericConditions';

// import { AirspaceType } from '@fmgc/types/fstypes/FSEnums';
// import { diffAngle, sin } from 'msfs-geo';

export class CostIndex {
    /**
     * Used to update the cruise speed in real time.
     * @param costIndex in kg/m
     * @returns Econ cruise speed in KAIS
     */
    static calculateLiveSpeed(costIndex: number, weight = SimVar.GetSimVarValue('L:A32NX_FM_GROSS_WEIGHT', 'Number')): number {
        let workingADIRS = 0;
        workingADIRS += +!!(Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_1_MAINT_WORD').value === 4) * 1;
        workingADIRS += +!!(Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_2_MAINT_WORD').value === 4) * 2;
        workingADIRS += +!!(Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_3_MAINT_WORD').value === 4) * 4;
        console.log('ADIRS', workingADIRS);

        // SimVar.SetSimVarValue('L:workingADIRS', 'number', workingADIRS);
        let track = 0;
        let windSpeed = 0;
        let windDirection = 0;
        let altitude = 0;
        let temperature = 0;
        let pressure = 0;
        let isaDev = 0;
        let trueAirSpeed = 0;
        let groundSpeed = 0;
        weight *= 2.20462;
        if (weight === 0) {
            return 289;
        }

        // 1, 3, 2 for FMGC 1 currently implemented
        // 2, 3, 1 for FMGC 2 needs to be added
        switch (workingADIRS) {
        case 0:
            break;
        case 1:
        case 3:
        case 5:
            // ADIRS 1 is alligned
            track = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_1_TRACK').value;
            windDirection = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_1_WIND_DIRECTION').value;
            windSpeed += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_1_WIND_SPEED').value;
            altitude = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_1_ALTITUDE').value;
            temperature = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_1_STATIC_AIR_TEMPERATURE').value;
            pressure = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_1_CORRECTED_AVERAGE_STATIC_PRESSURE').value;
            isaDev = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_1_INTERNATIONAL_STANDARD_ATMOSPHERE_DELTA').value;
            trueAirSpeed = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_1_TRUE_AIRSPEED').value;
            groundSpeed = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_1_GROUND_SPEED').value;
            break;

        case 4:
        case 6:
            // ADIRS 3 is alligned
            track = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_3_TRACK').value;
            windDirection = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_3_WIND_DIRECTION').value;
            windSpeed += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_3_WIND_SPEED').value;
            altitude = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_3_ALTITUDE').value;
            temperature = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_3_STATIC_AIR_TEMPERATURE').value;
            pressure = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_3_CORRECTED_AVERAGE_STATIC_PRESSURE').value;
            isaDev = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_3_INTERNATIONAL_STANDARD_ATMOSPHERE_DELTA').value;
            trueAirSpeed = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_3_TRUE_AIRSPEED').value;
            groundSpeed = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_3_GROUND_SPEED').value;

            break;

        case 2:
            // ADIRS 2 is alligned
            track = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_2_TRACK').value;
            windDirection = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_2_WIND_DIRECTION').value;
            windSpeed += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_2_WIND_SPEED').value;
            altitude = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_2_ALTITUDE').value;
            temperature = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_2_STATIC_AIR_TEMPERATURE').value;
            pressure = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_2_CORRECTED_AVERAGE_STATIC_PRESSURE').value;
            isaDev = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_2_INTERNATIONAL_STANDARD_ATMOSPHERE_DELTA').value;
            trueAirSpeed = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_2_TRUE_AIRSPEED').value;
            groundSpeed = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_2_GROUND_SPEED').value;

            break;
        case 7:
            // All ADIRS are alligned
            track += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_1_TRACK').value;
            track += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_2_TRACK').value;
            track += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_3_TRACK').value;
            track /= 3;

            windDirection += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_1_WIND_DIRECTION').value;
            windDirection += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_2_WIND_DIRECTION').value;
            windDirection += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_3_WIND_DIRECTION').value;
            windDirection /= 3;

            windSpeed += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_1_WIND_SPEED').value;
            windSpeed += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_2_WIND_SPEED').value;
            windSpeed += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_3_WIND_SPEED').value;
            windSpeed /= 3;

            altitude += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_1_ALTITUDE').value;
            altitude += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_2_ALTITUDE').value;
            altitude += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_3_ALTITUDE').value;
            altitude /= 3;

            temperature += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_1_STATIC_AIR_TEMPERATURE').value;
            temperature += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_2_STATIC_AIR_TEMPERATURE').value;
            temperature += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_3_STATIC_AIR_TEMPERATURE').value;
            temperature /= 3;

            pressure += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_1_CORRECTED_AVERAGE_STATIC_PRESSURE').value;
            pressure += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_2_CORRECTED_AVERAGE_STATIC_PRESSURE').value;
            pressure += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_3_CORRECTED_AVERAGE_STATIC_PRESSURE').value;
            pressure /= 3;

            isaDev = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_1_INTERNATIONAL_STANDARD_ATMOSPHERE_DELTA').value;
            isaDev = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_2_INTERNATIONAL_STANDARD_ATMOSPHERE_DELTA').value;
            isaDev = Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_3_INTERNATIONAL_STANDARD_ATMOSPHERE_DELTA').value;
            isaDev /= 3;

            trueAirSpeed += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_1_TRUE_AIRSPEED').value;
            trueAirSpeed += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_2_TRUE_AIRSPEED').value;
            trueAirSpeed += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_ADR_3_TRUE_AIRSPEED').value;
            trueAirSpeed /= 3;

            groundSpeed += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_1_GROUND_SPEED').value;
            groundSpeed += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_2_GROUND_SPEED').value;
            groundSpeed += Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_3_GROUND_SPEED').value;
            groundSpeed /= 3;

            break;
        default:
            break;
        }

        // const dCI = (this.costIndex / 999) ** 2;
        // return 290 * (1 - dCI) + 310 * dCI;
        console.log('track', track);
        console.log('windDirection', windDirection);
        // console.log('huh?', windDirection, MathUtils.DEGREES_TO_RADIANS, windDirection * MathUtils.DEGREES_TO_RADIANS);

        track *= MathUtils.DEGREES_TO_RADIANS;
        windDirection *= MathUtils.DEGREES_TO_RADIANS;

        console.log('rad track', track);
        console.log('rad windDirection', windDirection);

        const theta = Common.getTheta(altitude, isaDev);
        // const theta2 = Common.getTheta2(theta, mach);
        const delta = Common.getDelta(theta);
        // const delta2 = Common.getDelta2(delta, mach);
        temperature = MathUtils.convertCtoK(temperature);

        console.log('weight', weight * 1000);
        let cas = this.costIndexToCAS(costIndex, altitude / 100, weight * 1000, isaDev, track, windDirection, windSpeed, pressure, temperature);
        let tas = MathUtils.convertKCasToKTAS(cas, temperature, pressure);
        let mach = MathUtils.convertKTASToMach(tas, temperature);
        const calculatedGroundSpeed = Math.abs(this.calculateGroundSpeed(track, tas, windDirection, windSpeed));
        console.log('groundSpeed calculated vs actual', calculatedGroundSpeed, groundSpeed, calculatedGroundSpeed / groundSpeed);
        console.log('airSpeed calculated vs actual', tas, trueAirSpeed, tas / trueAirSpeed);

        console.log('initial speed', tas);
        console.log('initial mach', mach);

        if (mach >= 0.8) {
            mach = 0.8;
            tas = MathUtils.convertMachToKCas(0.8, temperature, pressure);
            cas = MathUtils.convertMachToKCas(0.8, temperature, pressure);
            console.log('mach corrected', mach, tas, cas);
        } else {
            console.log('mach not corrected', mach, tas, cas);
        }

        if (cas >= 340) {
            cas = 340;
            tas = MathUtils.convertKCasToKTAS(cas, temperature, pressure);
            mach = MathUtils.convertKTASToMach(tas, temperature);
            console.log('tas corrected', mach, tas, cas);
        } else {
            console.log('tas not corrected', mach, tas, cas);
        }
        console.log('tas', tas);
        console.log('cas', cas);
        console.log('trueAirSpeed', trueAirSpeed);
        console.log('mach', mach);
        console.log('theta', theta);
        console.log('delta', delta);
        console.log('pressure', pressure);
        console.log('costIndex', costIndex);
        console.log('altitude', altitude);
        console.log('isaDev:', isaDev);
        console.log('track', track);
        console.log('windDirection', windDirection);
        console.log('windSpeed', windSpeed);
        console.log('A32NX_ADIRS_IR_1_MAINT_WORD', Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_1_MAINT_WORD').value);
        console.log('A32NX_ADIRS_IR_2_MAINT_WORD', Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_2_MAINT_WORD').value);
        console.log('A32NX_ADIRS_IR_3_MAINT_WORD', Arinc429Word.fromSimVarValue('L:A32NX_ADIRS_IR_3_MAINT_WORD').value);

        console.log('speed', tas);
        return cas;
    }

    /**
     * Calculate specific air range (KTAS / uncorrected fuel flow)
     * @param tas
     * @param altitude In feet
     * @param weight In pounds
     * @param isaDev ISA deviation (in celsius)
     * @returns SR in nautical miles per pound of fuel
     */
    static calculateFuelFlow(tas: number, altitude: number, weight: number, isaDev: number, temperature: number): number {
        const theta = Common.getTheta(altitude, isaDev);
        console.log('Mach, Temperature', tas, temperature);
        const mach = MathUtils.convertKTASToMach(tas, temperature);
        const theta2 = Common.getTheta2(theta, mach);
        const delta = Common.getDelta(theta);
        const delta2 = Common.getDelta2(delta, mach);

        const thrust = FlightModel.getDrag(weight, mach, delta, false, false, FlapConf.CLEAN);
        console.log(mach, thrust);
        // Divide by 2 to get thrust per engine
        const correctedThrust = (thrust / delta2) / 2;
        // Since table 1506 describes corrected thrust as a fraction of max thrust, divide it
        const correctedN1 = EngineModel.reverseTableInterpolation(EngineModel.table1506, mach, (correctedThrust / EngineModel.maxThrust));
        // Fuel flow units are lbs/hr
        const correctedFuelFlow = EngineModel.getCorrectedFuelFlow(correctedN1, mach, altitude);
        const fuelFlow = EngineModel.getUncorrectedFuelFlow(correctedFuelFlow, delta2, theta2);
        // console.log(correctedFuelFlow, fuelFlow);

        return fuelFlow;
    }

    /**
     * Calculates the ground speed from a given track, airspeed, wind direction, and wind speed.
     * @param track In radians
     * @param airSpeed True air speed
     * @param windDirection In radians
     * @param windSpeed True air speed
     * @returns Ground speed
     */
    static calculateGroundSpeed(track: number, airSpeed: number, windDirection: number, windSpeed: number): number {
        /**
         * Triangle caculations are based one the following
         * Side a: ground speed
         * Side b: true air speed
         * Side c: wind speed
         * Angle A: difference betweeen heading and track
         * Angle B: difference betweeen track and wind direction
         * Angle C: difference betweeen track and heading
         */
        const angleB:number = track - windDirection;
        // Law of sines: B = asin(c / sin(C) * b)
        const angleC:number = Math.asin(windSpeed * Math.sin(angleB) / airSpeed);
        // All angles in a triangle add up to pi or 180
        const angleA:number = Math.PI - Math.abs(angleB) - Math.abs(angleC);
        // console.log(track, airSpeed, windDirection, windSpeed, MathUtils.RADIANS_TO_DEGREES * angleA, MathUtils.RADIANS_TO_DEGREES * angleB, MathUtils.RADIANS_TO_DEGREES * angleC);
        // console.log(angleA, angleB, angleC);
        // Law of sines: a / sin(A) = b / sin(B) -> a = b / sin(B) * sin(A)
        return airSpeed * Math.sin(angleA) / Math.sin(angleB);
    }

    /**
     * Generates an initial estimate for Mmrc
     * @param weight In pounds
     * @param delta Pressure ratio
     * @returns Mach
     */
    static initialMachEstimate(weight: number, delta: number): number {
        return 1.565 * Math.sqrt(weight / (1481 * FlightModel.wingArea * delta));
    }

    /**
     * Returns the mach number for maximum-range cruise
     * @param altitude In feet
     * @param weight In pounds
     * @param isaDev ISA deviation (in celsius)
     * @returns Mmrc
     */
    static naiveFindMmrc(altitude: number, weight: number, isaDev: number, costIndex: number, temperature: number): number {
        // Getting the pressure ratio
        const delta = Common.getDelta(altitude);
        const m1 = Math.min(CostIndex.initialMachEstimate(weight, delta), 0.78);
        const mRound = Math.round((m1 + Number.EPSILON) * 100) / 100;

        const lowerBound = mRound - 0.1;
        const upperBound = Math.min(mRound + 0.1, 0.79);
        const results = [];
        // Calculates the maximum range for a range of mach numbers and then finds the offset of the optimal mach number from the lowerbound
        for (let i = lowerBound; i < upperBound; i += 0.01) {
            results.push(CostIndex.calculateFuelFlow(i, altitude, weight, isaDev, temperature));
        }
        const indexofMax = results.reduce((iMax, x, i, arr) => (x > arr[iMax] ? i : iMax), 0);

        return lowerBound + indexofMax * 0.01;
    }

    /**
     * Returns optimal mach number for the set cost index under the current circumstance
     * @param costIndex In kg/min
     * @param flightLevel flightLevel in feet
     * @param weight In pounds
     * @param isaDev ISA deviation (in celsius)
     * @param windDirection In radians (optional)
     * @param windSpeed True air speed (optional)
     * @returns Econ mach
     */
    static costIndexToCAS(costIndex: number, flightLevel: number, weight: number, isaDev = 0, track = 0, windDirection = 0, windSpeed = 0, pressure: number, temperature: number): number {
        const fac1 = Arinc429Word.fromSimVarValue('L:A32NX_FAC_1_V_MAN').value;
        const fac2 = Arinc429Word.fromSimVarValue('L:A32NX_FAC_2_V_MAN').value;

        const lowerBound = Math.floor(Math.min(fac1, fac2)) - 100;
        const upperBound = 350;
        const results = [];
        const speeds = [];
        // const theta = Common.getTheta(altitude, isaDev);
        // const theta2 = Common.getTheta2(theta, mach);
        // const delta = Common.getDelta(theta);
        // const delta2 = Common.getDelta2(delta, mach);
        // console.log(fac1, fac2, lowerBound);
        // console.log(delta, theta);
        let min = 1000;
        let indexofMin = 0;

        // Calculates the maximum range for a range of mach numbers and then finds the offset of the optimal econ mach number.
        for (let i = lowerBound; i <= upperBound; i += 1) {
            // Calculates the nauticle miles per pound of fuel accounting for wind speeds. SR = SR(without winds) * groundSpeed / TAS
            // console.log(MathUtils.convertKCasToKTAS(i, temperature, pressure));
            const airSpeed = MathUtils.convertKCasToKTAS(i, temperature, pressure);
            const fuelFlow = Math.abs(CostIndex.calculateFuelFlow(airSpeed, flightLevel, weight, isaDev, temperature)) + costIndex * 132.277;

            // still needs to be fixed

            const groundSpeed = Math.abs(this.calculateGroundSpeed(track, airSpeed, windDirection, windSpeed));
            // console.log(i, airSpeed, groundSpeed, fuelFlow - costIndex * 132.277, costIndex * 132.277, fuelFlow / groundSpeed, min);
            if (Number.isNaN(fuelFlow)) {
                i = upperBound;
                console.log('Fuel Flow  is NaN');
            } else {
                results.push(Math.abs(fuelFlow / groundSpeed));
                if (Math.abs(fuelFlow / groundSpeed) < min) {
                    min = fuelFlow / groundSpeed;
                    indexofMin = i;
                // console.log('new low', min, indexofMin);
                }
            }
        }
        // const resultValues = results.values();
        // results.reduce((iMax, x, i, arr) => (x < arr[iMax] ? i : iMax), 1000);
        for (let i = 0; i < results.length; i++) {
            console.log(`${speeds[i].toString()}\t${results[i].toString()}`);
        }
        // console.log(indexofMin);
        return indexofMin;

        /*
        const Mmrc = CostIndex.naiveFindMmrc(flightLevel * 100, weight, isaDev, costIndex);
        return ((-1 * (0.8 - Mmrc)) * Math.exp(-0.05 * ci)) + 0.8;
        */
    }

    /**
     * TODO: Calculates the econ climb speeds
     * @param ci In kg/min
     * @param flightLevel Altitude in feet / 100
     * @param weight In pounds - should be total weight at T/C
     * @returns Econ climb cas
     */
    static costIndexToClimbCas(ci: number, flightLevel: number, weight: number): number {
        const weightInTons = Math.min(Math.max(Common.poundsToMetricTons(weight), 50), 77);
        const airspeed = 240 + (0.1 * flightLevel) + ci + (0.5 * (weightInTons - 50));
        return Math.min(Math.max(airspeed, 270), 340);
    }

    /**
     * TODO: Calculates the descent speeds
     * @param ci In kg/min
     * @param flightLevel Altitude in feet / 100
     * @param weight In pounds - should be total weight at T/D
     * @returns Econ descent cas
     */
    static costIndexToDescentCas(ci: number, flightLevel: number, weight: number): number {
        const weightInTons = Math.min(Math.max(Common.poundsToMetricTons(weight), 50), 77);
        const airspeed = 205 + (0.13 * flightLevel) + (1.5 * ci) - (0.05 * (weightInTons - 50));
        return Math.min(Math.max(airspeed, 270), 340);
    }
}
