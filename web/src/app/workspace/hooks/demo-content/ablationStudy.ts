/**
 * Ablation Study — HTML Content for Demo Scenario 3
 *
 * Object detection ablation experiment document.
 * Injected into AI Editor (Notes) via componentStore.
 */

export const ABLATION_STUDY_HTML = `
<h1>Object Detection Ablation Study Report</h1>

<h2>1. Experimental Setup</h2>

<h3>1.1 Base Configuration</h3>
<ul>
  <li><strong>Dataset</strong>: COCO 2017 (118K train / 5K val)</li>
  <li><strong>Evaluation Metrics</strong>: mAP, AP<sub>50</sub>, AP<sub>75</sub>, AP<sub>S</sub>, AP<sub>M</sub>, AP<sub>L</sub></li>
  <li><strong>Training Config</strong>: SGD, lr=0.01, weight_decay=1e-4, batch_size=16</li>
  <li><strong>Training Epochs</strong>: 12 epochs (1x schedule)</li>
  <li><strong>GPU</strong>: 8x NVIDIA A100 80GB</li>
</ul>

<h3>1.2 Ablation Variables</h3>
<table>
  <thead>
    <tr>
      <th>Variable</th>
      <th>Options</th>
      <th>Default</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Backbone</td><td>ResNet-50, ResNet-101, Swin-T, Swin-S</td><td>ResNet-50</td></tr>
    <tr><td>Neck</td><td>FPN, PAFPN, BiFPN, NAS-FPN</td><td>FPN</td></tr>
    <tr><td>Detection Head</td><td>Anchor-based, Anchor-free (FCOS), DETR</td><td>Anchor-based</td></tr>
    <tr><td>Data Augmentation</td><td>None, Mosaic, MixUp, CutOut, Combined</td><td>None</td></tr>
    <tr><td>Loss Function</td><td>Smooth L1, GIoU, DIoU, CIoU</td><td>Smooth L1</td></tr>
    <tr><td>NMS</td><td>Hard NMS, Soft-NMS, DIoU-NMS</td><td>Hard NMS</td></tr>
  </tbody>
</table>

<h2>2. Baseline Results</h2>

<p>Baseline model: Faster R-CNN + ResNet-50 + FPN, 1x schedule</p>

<table>
  <thead>
    <tr>
      <th>Model</th>
      <th>mAP</th>
      <th>AP<sub>50</sub></th>
      <th>AP<sub>75</sub></th>
      <th>AP<sub>S</sub></th>
      <th>AP<sub>M</sub></th>
      <th>AP<sub>L</sub></th>
      <th>FPS</th>
    </tr>
  </thead>
  <tbody>
    <tr><td><strong>Baseline (R50+FPN)</strong></td><td>37.4</td><td>58.1</td><td>40.4</td><td>21.2</td><td>41.0</td><td>48.1</td><td>24.3</td></tr>
  </tbody>
</table>

<h2>3. Ablation Study Results</h2>

<h3>3.1 Backbone Ablation</h3>
<p>Fixed: FPN + Anchor-based Head + No Aug + Smooth L1 + Hard NMS</p>

<table>
  <thead>
    <tr>
      <th>Backbone</th>
      <th>Params (M)</th>
      <th>FLOPs (G)</th>
      <th>mAP</th>
      <th>AP<sub>50</sub></th>
      <th>AP<sub>75</sub></th>
      <th>&Delta; mAP</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>ResNet-50</td><td>41.5</td><td>207</td><td>37.4</td><td>58.1</td><td>40.4</td><td>-</td></tr>
    <tr><td>ResNet-101</td><td>60.5</td><td>283</td><td>39.4</td><td>60.1</td><td>43.1</td><td style="color:green"><strong>+2.0</strong></td></tr>
    <tr><td>Swin-T</td><td>47.8</td><td>264</td><td>42.7</td><td>65.2</td><td>46.8</td><td style="color:green"><strong>+5.3</strong></td></tr>
    <tr><td>Swin-S</td><td>69.1</td><td>354</td><td>44.5</td><td>66.1</td><td>48.9</td><td style="color:green"><strong>+7.1</strong></td></tr>
  </tbody>
</table>

<p><strong>Analysis</strong>: Swin Transformer backbone yields significant improvement (+5.3 to +7.1 mAP). Swin-T achieves a 5.3-point mAP gain with a parameter count comparable to ResNet-50. Swin-S provides further improvement at the cost of a 45% increase in parameters.</p>

<h3>3.2 Neck Ablation</h3>
<p>Fixed: ResNet-50 + Anchor-based Head + No Aug + Smooth L1 + Hard NMS</p>

<table>
  <thead>
    <tr>
      <th>Neck</th>
      <th>mAP</th>
      <th>AP<sub>50</sub></th>
      <th>AP<sub>75</sub></th>
      <th>AP<sub>S</sub></th>
      <th>&Delta; mAP</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>FPN</td><td>37.4</td><td>58.1</td><td>40.4</td><td>21.2</td><td>-</td></tr>
    <tr><td>PAFPN</td><td>38.5</td><td>59.3</td><td>41.8</td><td>22.8</td><td style="color:green"><strong>+1.1</strong></td></tr>
    <tr><td>BiFPN</td><td>39.2</td><td>60.5</td><td>42.6</td><td>23.5</td><td style="color:green"><strong>+1.8</strong></td></tr>
    <tr><td>NAS-FPN</td><td>39.5</td><td>60.8</td><td>43.1</td><td>23.2</td><td style="color:green"><strong>+2.1</strong></td></tr>
  </tbody>
</table>

<p><strong>Analysis</strong>: Feature pyramid upgrades yield smaller gains (+1.1 to +2.1) compared to backbone upgrades. BiFPN and NAS-FPN show more notable improvements in small object detection (AP<sub>S</sub>).</p>

<h3>3.3 Detection Head Ablation</h3>
<p>Fixed: ResNet-50 + FPN + No Aug + corresponding default Loss</p>

<table>
  <thead>
    <tr>
      <th>Head</th>
      <th>mAP</th>
      <th>AP<sub>50</sub></th>
      <th>AP<sub>75</sub></th>
      <th>FPS</th>
      <th>&Delta; mAP</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Anchor-based (Faster R-CNN)</td><td>37.4</td><td>58.1</td><td>40.4</td><td>24.3</td><td>-</td></tr>
    <tr><td>Anchor-free (FCOS)</td><td>38.7</td><td>57.4</td><td>41.8</td><td>26.1</td><td style="color:green"><strong>+1.3</strong></td></tr>
    <tr><td>DETR</td><td>42.0</td><td>62.4</td><td>44.2</td><td>18.7</td><td style="color:green"><strong>+4.6</strong></td></tr>
  </tbody>
</table>

<p><strong>Analysis</strong>: DETR achieves the highest detection accuracy (+4.6 mAP) but with a significant drop in inference speed. FCOS provides a slight improvement while maintaining high speed.</p>

<h3>3.4 Data Augmentation Ablation</h3>
<p>Fixed: ResNet-50 + FPN + Anchor-based + Smooth L1 + Hard NMS</p>

<table>
  <thead>
    <tr>
      <th>Augmentation Strategy</th>
      <th>mAP</th>
      <th>AP<sub>50</sub></th>
      <th>AP<sub>75</sub></th>
      <th>&Delta; mAP</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>None</td><td>37.4</td><td>58.1</td><td>40.4</td><td>-</td></tr>
    <tr><td>Mosaic</td><td>39.1</td><td>59.8</td><td>42.3</td><td style="color:green"><strong>+1.7</strong></td></tr>
    <tr><td>MixUp</td><td>38.2</td><td>58.9</td><td>41.5</td><td style="color:green"><strong>+0.8</strong></td></tr>
    <tr><td>CutOut</td><td>37.9</td><td>58.7</td><td>41.0</td><td style="color:green"><strong>+0.5</strong></td></tr>
    <tr><td>Combined (Mosaic+MixUp)</td><td>40.3</td><td>61.2</td><td>43.7</td><td style="color:green"><strong>+2.9</strong></td></tr>
  </tbody>
</table>

<p><strong>Analysis</strong>: Combined data augmentation yields the best results (+2.9 mAP). Mosaic augmentation is the most effective for object detection (+1.7), followed by MixUp.</p>

<h3>3.5 Loss Function Ablation</h3>
<p>Fixed: ResNet-50 + FPN + Anchor-based + No Aug + Hard NMS</p>

<table>
  <thead>
    <tr>
      <th>Loss</th>
      <th>mAP</th>
      <th>AP<sub>75</sub></th>
      <th>&Delta; mAP</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Smooth L1</td><td>37.4</td><td>40.4</td><td>-</td></tr>
    <tr><td>GIoU</td><td>38.3</td><td>41.5</td><td style="color:green"><strong>+0.9</strong></td></tr>
    <tr><td>DIoU</td><td>38.5</td><td>41.8</td><td style="color:green"><strong>+1.1</strong></td></tr>
    <tr><td>CIoU</td><td>38.8</td><td>42.2</td><td style="color:green"><strong>+1.4</strong></td></tr>
  </tbody>
</table>

<p><strong>Analysis</strong>: IoU-based loss functions show more prominent advantages in high-precision detection (AP<sub>75</sub>). CIoU, which considers overlap area, center distance, and aspect ratio, achieves the best results.</p>

<h2>4. Optimal Combination</h2>

<p>Based on ablation study results, combining the best configuration from each dimension:</p>

<table>
  <thead>
    <tr>
      <th>Configuration</th>
      <th>mAP</th>
      <th>AP<sub>50</sub></th>
      <th>AP<sub>75</sub></th>
      <th>AP<sub>S</sub></th>
      <th>AP<sub>M</sub></th>
      <th>AP<sub>L</sub></th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Baseline</td><td>37.4</td><td>58.1</td><td>40.4</td><td>21.2</td><td>41.0</td><td>48.1</td></tr>
    <tr><td><strong>Best Combo</strong><br/>(Swin-S + BiFPN + CIoU + Combined Aug)</td><td><strong>48.7</strong></td><td><strong>69.3</strong></td><td><strong>53.2</strong></td><td><strong>31.5</strong></td><td><strong>52.4</strong></td><td><strong>62.8</strong></td></tr>
    <tr><td colspan="7" style="text-align:center; color:green"><strong>&Delta; Total: +11.3 mAP</strong></td></tr>
  </tbody>
</table>

<h2>5. Conclusions</h2>

<ol>
  <li><strong>Backbone has the largest impact</strong>: Swin Transformer backbone contributes the greatest performance gain (+5.3 to +7.1 mAP) and is the most worthwhile upgrade direction</li>
  <li><strong>Data augmentation is the most cost-effective</strong>: Combined augmentation strategy (+2.9 mAP) incurs zero additional inference overhead and should be the default training configuration</li>
  <li><strong>Neck and Loss provide consistent gains</strong>: BiFPN (+1.8) and CIoU (+1.4) both deliver consistent improvements</li>
  <li><strong>DETR Head has highest accuracy but slower speed</strong>: The accuracy vs latency trade-off should be weighed based on deployment scenario</li>
  <li><strong>Improvements are approximately orthogonal</strong>: The optimal combination (48.7 mAP) is close to the sum of individual improvements (baseline 37.4 + 7.1 + 1.8 + 1.4 + 2.9 = 50.6), with slight orthogonality loss in practice</li>
</ol>

<hr/>
<p><em>Generated by Prismer.AI Research Agent | COCO 2017 benchmark</em></p>
`;
