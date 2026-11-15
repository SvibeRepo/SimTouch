import { eventBus } from '../../util/eventManager.js';
import { debugManager } from '../../util/debugManager.js';

export const Behaviors = {
  NONE: "None",
  FLUID: "Fluid",
  SWARM: "Swarm",
  AUTOMATA: "Automata",
  CHAIN: "Chain",
};

export class OrganicBehavior {
  constructor() {
    this.currentBehavior = "None";

    this.params = {
      Fluid: {
        radius: 20,
        surfaceTension: 0.5,
        viscosity: 0.2,
        damping: 0.98,
        mode: "Fluid",
      },
      Swarm: {
        radius: 30,
        cohesion: 1.0,
        alignment: 0.7,
        separation: 1.2,
        maxSpeed: 0.5,
        mode: "Swarm",
      },
      Automata: {
        radius: 30,
        repulsion: 0.8,
        attraction: 0.5,
        threshold: 0.2,
        mode: "Automata",
      },
      Chain: {
        radius: 30,
        linkDistance: 0,
        linkStrength: 10,
        alignment: 0.5,
        branchProb: 2,
        maxLinks: 10,
        maxChains: 10,
        mode: "Chain",
      },
    };

    this.forceScales = {
      Fluid: {
        base: 0.1,
        surfaceTension: 0.5,
        viscosity: 0.2,
      },
      Swarm: {
        base: 0.01,
        cohesion: 0.1,
        separation: 0.15,
      },
      Automata: {
        base: 0.1,
      },
      Chain: {
        base: 1.5,
      },
    };

    if (this.db) {
      console.log(
        "OrganicBehavior initialized:",
        JSON.stringify(
          {
            currentBehavior: this.currentBehavior,
            params: this.params,
          },
          null,
          2
        )
      );
    }

    // Subscribe to parameter updates
    eventBus.on('simParamsUpdated', this.handleParamsUpdate.bind(this));
  }

  // Add handler for simParams updates
  handleParamsUpdate({ simParams }) {
    if (simParams?.organic) {
      const organicParams = simParams.organic;
      const forceTypes = ["Fluid", "Swarm", "Automata", "Chain"]; // Define behavior types

      this.currentBehavior = organicParams.behavior ?? this.currentBehavior;

      // Update global force/radius potentially affecting multiple internal params
      if (organicParams.globalForce !== undefined) {
        forceTypes.forEach((type) => {
          if (this.forceScales[type]) {
            this.forceScales[type].base = organicParams.globalForce;
          }
        });
      }
      if (organicParams.globalRadius !== undefined) {
        forceTypes.forEach((type) => {
          if (this.params[type]) {
            this.params[type].radius = organicParams.globalRadius;
          }
        });
      }

      // Update specific behavior params
      if (organicParams.Fluid) {
        this.params.Fluid.surfaceTension = organicParams.Fluid.surfaceTension ?? this.params.Fluid.surfaceTension;
        this.params.Fluid.viscosity = organicParams.Fluid.viscosity ?? this.params.Fluid.viscosity;
        this.params.Fluid.damping = organicParams.Fluid.damping ?? this.params.Fluid.damping;
      }
      if (organicParams.Swarm) {
        this.params.Swarm.cohesion = organicParams.Swarm.cohesion ?? this.params.Swarm.cohesion;
        this.params.Swarm.alignment = organicParams.Swarm.alignment ?? this.params.Swarm.alignment;
        this.params.Swarm.separation = organicParams.Swarm.separation ?? this.params.Swarm.separation;
        this.params.Swarm.maxSpeed = organicParams.Swarm.maxSpeed ?? this.params.Swarm.maxSpeed;
      }
      if (organicParams.Automata) {
        this.params.Automata.repulsion = organicParams.Automata.repulsion ?? this.params.Automata.repulsion;
        this.params.Automata.attraction = organicParams.Automata.attraction ?? this.params.Automata.attraction;
        this.params.Automata.threshold = organicParams.Automata.threshold ?? this.params.Automata.threshold;
      }
      if (organicParams.Chain) {
        this.params.Chain.linkDistance = organicParams.Chain.linkDistance ?? this.params.Chain.linkDistance;
        this.params.Chain.linkStrength = organicParams.Chain.linkStrength ?? this.params.Chain.linkStrength;
        this.params.Chain.alignment = organicParams.Chain.alignment ?? this.params.Chain.alignment;
        this.params.Chain.branchProb = organicParams.Chain.branchProb ?? this.params.Chain.branchProb;
        this.params.Chain.maxLinks = organicParams.Chain.maxLinks ?? this.params.Chain.maxLinks;
      }

      // Optional: Re-initialize spatial grid if perceptionRadius changes?
      // We used globalRadius, need to check if perceptionRadius is used separately
      // const previousRadius = this.perceptionRadius; // Need to store perceptionRadius if used
      // this.perceptionRadius = organicParams.perceptionRadius ?? this.perceptionRadius;
      // if (this.perceptionRadius !== previousRadius && typeof this.neighborSearch?.updateResolution === 'function') {
      //     // Assuming neighborSearch uses radius, might need update method
      //     if(this.db) console.log("OrganicBehavior: Radius changed. Updating neighbor search.");
      //     // this.neighborSearch.updateResolution(this.perceptionRadius); // Example call
      // }
    }
    if (this.db) console.log(`OrganicBehavior updated params via event: ${this.currentBehavior}`);
  }

  reset() {
    // Reset any stored particle state
    this.currentBehavior = "None";
  }

  get db() {
    return debugManager.get('organic');
  }
}
