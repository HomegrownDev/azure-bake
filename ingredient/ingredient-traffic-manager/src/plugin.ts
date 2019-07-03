import { BaseIngredient, IngredientManager } from "@azbake/core";
import { IIngredient,  DeploymentContext } from "@azbake/core";
import { ARMHelper } from "@azbake/arm-helper";

import profile from './trf-mgr.json';
import endpoint from './endpoint.json';
import { TrafficUtils } from './functions';

export class TrafficManager extends BaseIngredient {
    constructor(name: string, ingredient: IIngredient, ctx: DeploymentContext) {
        super(name, ingredient, ctx);
        this._helper = new ARMHelper(this._ctx);
    }
    _helper: ARMHelper;

    public async Execute(): Promise<void> {

        let util = IngredientManager.getIngredientFunction("coreutils", this._ctx);

        try {
            // deploy the traffic manager profile to the primary region only
            if (util.current_region_primary()) {
                await this.DeployProfile();
            }

            await this.DeployEndpoint();

        } catch(error){
            this._logger.error(`deployment failed: ${error}`);
            throw error;
        }
    }

    public async DeployProfile(): Promise<void> {
        try {
            let util = IngredientManager.getIngredientFunction("coreutils", this._ctx);
    
            const region = this._ctx.Region.code;
            let trfutil = new TrafficUtils(this._ctx);
    
            let props = await this._helper.BakeParamsToARMParamsAsync(this._name, this._ctx.Ingredient.properties.parameters);
            props["name"] = {"value": trfutil.get_profile() };

            if (!props["diagnosticsEnabled"])
                props["diagnosticsEnabled"] = {"value": "yes"}

            if (props["diagnosticsEnabled"].value === "yes") {
                const ehnUtils = IngredientManager.getIngredientFunction("eventhubnamespace", this._ctx)

                var diagnosticsEventHubNamespace = ehnUtils.get_resource_name("diagnostics");
                props["diagnosticsEventHubNamespace"] = {"value": diagnosticsEventHubNamespace};
              
                var diagnosticsEventHubNamespaceResourceGroup: string

                diagnosticsEventHubNamespaceResourceGroup = await util.resource_group("diagnostics");

                props["diagnosticsEventHubResourceGroup"] = {"value": diagnosticsEventHubNamespaceResourceGroup};                
            }

            await this._helper.DeployTemplate(`${this._name}-profile`, profile, props, await util.resource_group());

        } catch(error){
            this._logger.error(`deployment failed: ${error}`);
            throw error;
        }
    }

    public async DeployEndpoint(): Promise<void> {
        
        try {
            let util = IngredientManager.getIngredientFunction("coreutils", this._ctx);
            const region = this._ctx.Region.code;
            let trfutil = new TrafficUtils(this._ctx);

            // read parameters to get the source-type.
            let temp: any = {};
            for ( const[n,v] of this._ingredient.properties.parameters){
                temp[n] = {
                    "value": await v.valueAsync(this._ctx)
                };
            }

            let props: any = {};

            const profileName = trfutil.get_profile();
            const epName = util.create_resource_name("ep", null, true);

            this._logger.log(`profile name: ${profileName}, endpoint name: ${epName}`);
            props["profile-name"] = { "value": profileName };
            props["ep-name"] = { "value": epName };

            const resource = util.parseResource(await this._ctx.Ingredient.properties.source.valueAsync(this._ctx));
            const sourceType = temp["source-type"].value;
            this._logger.log(`resource type: ${sourceType}, resource rg: ${resource.resourceGroup}, resource name: ${resource.resource}`);
            props["source-rg"] = { "value": resource.resourceGroup };
            props["source-name"] = { "value": resource.resource };
            props["source-type"] = temp["source-type"];

            await this._helper.DeployTemplate(`${this._name}-endpoint`, endpoint, props, await util.resource_group());
        } catch(error){
            this._logger.error(`deployment failed: ${error}`);
            throw error;
        }

    }
}